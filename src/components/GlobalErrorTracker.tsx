"use client";

import { ErrorBoundary } from "react-error-boundary";
import { trackError } from "@/lib/tracker";
import { useEffect } from "react";

// Komponen Fallback yang Tampil saat Error Fatal
function ErrorFallback({ error, resetErrorBoundary }: any) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 text-center">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-red-100">
                <div className="mb-4 flex justify-center">
                    <span className="text-4xl">💥</span>
                </div>
                <h2 className="mb-2 text-xl font-bold text-gray-900">Oops! Something went wrong</h2>
                <p className="mb-4 text-sm text-gray-600">
                    We have automatically reported this issue to our team.
                </p>

                <div className="mb-6 rounded bg-gray-100 p-3 text-left">
                    <p className="font-mono text-xs text-red-600 break-words">
                        {error.message}
                    </p>
                </div>

                <button
                    onClick={resetErrorBoundary}
                    className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
}

export default function GlobalErrorTracker({ children }: { children: React.ReactNode }) {
    // 1. Global Listener untuk Uncaught Exceptions (Non-React)
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            trackError(event.error || new Error(event.message));
        };

        const handleRejection = (event: PromiseRejectionEvent) => {
            trackError(new Error(`Unhandled Promise Rejection: ${event.reason}`));
        };

        window.addEventListener("error", handleError);
        window.addEventListener("unhandledrejection", handleRejection);

        return () => {
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);
        };
    }, []);

    // 2. React Error Boundary Wrapper
    return (
        <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onError={(error, info) => {
                // Log React Error ke Worker -> Firestore
                trackError(error, info);
            }}
        >
            {children}
        </ErrorBoundary>
    );
}
