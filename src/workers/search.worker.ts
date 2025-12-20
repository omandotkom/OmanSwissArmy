import { pipeline, env } from '@xenova/transformers';
import { toolGroups } from '../data/tools';

// Configuration
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';

// State
let pipelineInstance: any = null;
let embeddingsCache: { title: string; description: string; href: string; embedding: any }[] | null = null;
let isIndexing = false;

// Helpers
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

// Event Listener
self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;

    try {
        switch (type) {
            case 'init':
                if (pipelineInstance && embeddingsCache) {
                    self.postMessage({ type: 'ready' });
                    return;
                }

                if (isIndexing) return; // Prevent double init
                isIndexing = true;

                // Load Pipeline
                // console.log('[Worker] Loading Pipeline...');
                pipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
                    progress_callback: (data: any) => {
                        if (data.status === 'progress') {
                            self.postMessage({ type: 'progress', payload: data.progress });
                        }
                    }
                });

                // Index Tools
                // console.log('[Worker] Indexing Tools...');
                const allTools = toolGroups.flatMap(group => group.items);
                embeddingsCache = [];

                for (const tool of allTools) {
                    const text = `${tool.title}. ${tool.description}`;
                    const output = await pipelineInstance(text, { pooling: 'mean', normalize: true });
                    embeddingsCache.push({
                        ...tool,
                        embedding: output.data
                    });
                }

                isIndexing = false;
                self.postMessage({ type: 'ready' });
                break;

            case 'search':
                if (!pipelineInstance || !embeddingsCache) {
                    self.postMessage({ type: 'results', payload: [] });
                    return;
                }

                const query = payload;
                if (!query) {
                    self.postMessage({ type: 'results', payload: [] });
                    return;
                }

                const output = await pipelineInstance(query, { pooling: 'mean', normalize: true });
                const queryEmbedding = output.data;

                const scoredResults = embeddingsCache.map(doc => {
                    const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
                    return { item: doc, score: similarity };
                });

                const sorted = scoredResults
                    .sort((a, b) => b.score - a.score)
                    .filter(r => r.score > 0.25);

                self.postMessage({ type: 'results', payload: sorted });
                break;
        }
    } catch (error: any) {
        console.error('[Worker Error]', error);
        self.postMessage({ type: 'error', payload: error.message || 'Unknown error in worker' });
        isIndexing = false;
    }
};
