// Interface untuk tipedata
export interface ActivityLogInput {
    action: string;
    label?: string;
    details?: any;
}

// Singleton Worker Instance
let trackerWorker: Worker | null = null;

// Fungsi untuk membangunkan worker
const getWorker = () => {
    // Pastikan kita di browser (bukan server-side rendering)
    if (typeof window === 'undefined') return null;

    if (!trackerWorker) {
        trackerWorker = new Worker(new URL('../workers/activity.worker.ts', import.meta.url));

        // Kirim sinyal INIT sekalian kasih tahu apakah ini mode DEV atau PROD
        const isDev = process.env.NODE_ENV === 'development';
        trackerWorker.postMessage({
            type: 'INIT',
            payload: { isDev }
        });
    }
    return trackerWorker;
};

/**
 * Merekam aktivitas user menggunakan Web Worker (Background Thread)
 * 100% Non-Blocking UI & Offline Support
 */
export const trackActivity = (log: ActivityLogInput) => {
    const worker = getWorker();
    if (!worker) return;

    // Ambil info browser di Main Thread (Worker tidak bisa akses DOM/Window)
    const userAgent = navigator.userAgent;
    const screenResolution = `${window.screen.width}x${window.screen.height}`;
    const currentPath = window.location.pathname;

    // Kirim paket ke kurir (Worker)
    worker.postMessage({
        type: 'TRACK',
        payload: {
            ...log,
            userAgent,
            screen: screenResolution,
            path: currentPath,
            appVersion: "1.0.0"
        }
    });
};

/**
 * Mengambil username sistem dan mengirim ke worker
 * Dipanggil sekali saat aplikasi start
 */
export const initTrackerUser = async () => {
    const worker = getWorker();
    if (!worker) return;

    try {
        const res = await fetch('/api/system/user-info');
        if (res.ok) {
            const data = await res.json();
            if (data.username) {
                worker.postMessage({
                    type: 'SET_USER',
                    payload: { username: data.username }
                });
            }
        }
    } catch (e) {
        // Silent fail is fine, default will be used
        console.error("Failed to fetch user info", e);
    }
};
