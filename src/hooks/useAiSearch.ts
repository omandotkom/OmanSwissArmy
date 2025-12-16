import { useState, useEffect } from 'react';

// Define the shape of a search result
export interface SearchResult {
    item: {
        title: string;
        description: string;
        href: string;
    };
    score: number;
}

// Global State to persist worker across navigations/re-renders
let worker: Worker | null = null;
let isWorkerReady = false;
let globalProgress = 0;
let globalError: string | null = null;
// Listeners for multiple component instances
const listeners: Set<(type: string, payload: any) => void> = new Set();

export function useAiSearch() {
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isReady, setIsReady] = useState(isWorkerReady);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(globalError);
    const [progress, setProgress] = useState<number>(globalProgress);

    useEffect(() => {
        // 1. Initialize Worker if not exists
        if (!worker) {
            // Webpack/Next.js magic to load worker
            worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url));

            worker.onmessage = (event) => {
                const { type, payload } = event.data;

                // Update Local Global State
                if (type === 'ready') isWorkerReady = true;
                if (type === 'progress') globalProgress = payload;
                if (type === 'error') globalError = payload;

                // Broadcast to all active hooks
                listeners.forEach(listener => listener(type, payload));
            };

            // Start initialization
            worker.postMessage({ type: 'init' });
        }

        // 2. Define message handler for this specific hook instance
        const handleWorkerMessage = (type: string, payload: any) => {
            switch (type) {
                case 'ready':
                    setIsReady(true);
                    break;
                case 'progress':
                    setProgress(payload);
                    break;
                case 'results':
                    setResults(payload);
                    setIsLoading(false);
                    break;
                case 'error':
                    setError(payload);
                    setIsLoading(false);
                    break;
            }
        };

        // 3. Register listener
        listeners.add(handleWorkerMessage);

        // 4. Cleanup listener on unmount
        return () => {
            listeners.delete(handleWorkerMessage);
        };
    }, []);

    const search = (query: string) => {
        if (!worker || !isReady) return;

        if (!query.trim()) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        worker.postMessage({ type: 'search', payload: query });
    };

    return { search, results, isReady, isLoading, error, progress };
}

