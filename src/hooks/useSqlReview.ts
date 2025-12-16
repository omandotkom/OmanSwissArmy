import { useState, useEffect, useRef } from 'react';

export interface SqlReviewState {
    result: string | null;
    isReady: boolean;
    isLoading: boolean;
    progress: number;
    statusMessage: string;
    error: string | null;
}

export function useSqlReview() {
    const workerRef = useRef<Worker | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState<string>("Initializing...");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Initialize Worker
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../workers/sql-review.worker.ts', import.meta.url));

            workerRef.current.onmessage = (event) => {
                const { type, payload } = event.data;

                switch (type) {
                    case 'ready':
                        setIsReady(true);
                        setStatusMessage("AI Ready");
                        setProgress(100);
                        break;

                    case 'progress':
                        // Payload: { percent, file }
                        // Kita normalisasi progress agar smooth
                        setProgress(Math.round(payload.percent || 0));
                        break;

                    case 'status':
                        setStatusMessage(payload);
                        break;

                    case 'result':
                        setResult(payload);
                        setIsLoading(false);
                        break;

                    case 'error':
                        console.error("Worker Error Detail:", payload); // Log error asli
                        setError(payload);
                        setIsLoading(false);
                        setStatusMessage("Error Occurred");
                        break;
                }
            };

            // Start loading model immediately
            workerRef.current.postMessage({ type: 'init' });
        }

        return () => {
            // Optional: Terminate worker on component unmount
            // Tapi untuk AI model yang berat load-nya, mending jangan diterminate sering-sering.
            // Biarkan browser garbage collect atau keep alive.
        };
    }, []);

    const reviewSql = (sqlCode: string) => {
        if (!workerRef.current || !isReady) {
            setError("Model AI belum siap. Mohon tunggu 'Preparing Your AI...' selesai.");
            return;
        }

        setIsLoading(true);
        setResult(null); // Clear previous result
        setError(null);
        workerRef.current.postMessage({ type: 'review', payload: { sqlCode } });
    };

    return {
        reviewSql,
        result,
        isReady,
        isLoading,
        progress,
        statusMessage,
        error
    };
}
