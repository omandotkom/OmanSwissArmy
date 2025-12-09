"use client";

import { useState, useCallback } from "react";

export interface Toast {
    id: string;
    message: string;
    type: "success" | "error";
}

export const useToast = () => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback((message: string, type: "success" | "error" = "success") => {
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            removeToast(id);
        }, 3000);
    }, [removeToast]);

    return { toasts, addToast, removeToast };
};

export function ToastContainer({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) {
    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`flex items-center justify-between gap-4 min-w-[300px] rounded-lg border px-4 py-3 shadow-lg transition-all animate-in slide-in-from-right fade-in duration-300 ${toast.type === "success"
                            ? "bg-zinc-900 border-green-500/50 text-green-400"
                            : "bg-zinc-900 border-red-500/50 text-red-400"
                        }`}
                >
                    <span className="text-sm font-medium">{toast.message}</span>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="text-zinc-500 hover:text-zinc-300"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
}
