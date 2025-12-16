import { useState, useEffect, useRef } from 'react';
import { toolGroups } from '@/data/tools';

// Define the shape of a search result
export interface SearchResult {
    item: {
        title: string;
        description: string;
        href: string;
    };
    score: number;
}

// Global variable to hold the pipeline instance (singleton pattern for the client)
// We use a global variable outside the hook to prevent reloading the model on every re-render/remount
let pipelineInstance: any = null;
let embeddingsCache: { title: string; description: string; href: string; embedding: any }[] | null = null;
let isModelLoading = false;

export function useAiSearch() {
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);

    // Load the model and index the tools
    useEffect(() => {
        const loadModel = async () => {
            if (pipelineInstance || isModelLoading) {
                if (pipelineInstance && embeddingsCache) setIsReady(true);
                return;
            }

            isModelLoading = true;
            setIsLoading(true);

            try {
                // Dynamic import to avoid SSR issues
                const { pipeline, env } = await import('@xenova/transformers');

                // Configuration
                env.allowLocalModels = true;
                env.allowRemoteModels = false;
                env.localModelPath = '/models/';

                console.log('Loading AI Model from local...');
                // Load the feature extraction pipeline
                pipelineInstance = await pipeline('feature-extraction', 'all-MiniLM-L6-v2', {
                    progress_callback: (data: any) => {
                        if (data.status === 'progress') {
                            setProgress(data.progress);
                        }
                    }
                });

                console.log('Model loaded. Indexing tools...');

                // Flatten the tools list
                const allTools = toolGroups.flatMap(group => group.items);

                // Create embeddings for all tools
                // We combine title and description for better context
                embeddingsCache = [];

                for (const tool of allTools) {
                    const text = `${tool.title}. ${tool.description}`;
                    const output = await pipelineInstance(text, { pooling: 'mean', normalize: true });
                    embeddingsCache.push({
                        ...tool,
                        embedding: output.data
                    });
                }

                console.log('Indexing complete.');
                isModelLoading = false;
                setIsReady(true);
            } catch (err: any) {
                console.error('AI Init Error:', err);
                setError(err.message || 'Failed to load AI model');
                isModelLoading = false;
            } finally {
                setIsLoading(false);
            }
        };

        // Trigger load
        loadModel();
    }, []);

    // Search function
    const search = async (query: string) => {
        if (!pipelineInstance || !embeddingsCache || !query) {
            setResults([]);
            return;
        }

        try {
            // Compute embedding for the query
            const output = await pipelineInstance(query, { pooling: 'mean', normalize: true });
            const queryEmbedding = output.data;

            // Calculate Cosine Similarity
            const scoredResults = embeddingsCache.map(doc => {
                const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
                return { item: doc, score: similarity };
            });

            // Sort by score (descending) and top N
            const sorted = scoredResults
                .sort((a, b) => b.score - a.score)
                .filter(r => r.score > 0.25); // Threshold to filter irrelevant results

            setResults(sorted);
        } catch (err) {
            console.error('Search error:', err);
        }
    };

    return { search, results, isReady, isLoading, error, progress };
}

// Utility for Cosine Similarity
function cosineSimilarity(vecA: Float32Array | number[], vecB: Float32Array | number[]) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
}
