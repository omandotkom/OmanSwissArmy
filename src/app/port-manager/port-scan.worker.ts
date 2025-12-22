
// Web Worker for Port Scanning
// This keeps the main thread free and allows for simulated progress updates

self.onmessage = async (e: MessageEvent) => {
    const { port, checkUrl } = e.data;

    if (!port) return;

    try {
        // Simulate initial progress
        self.postMessage({ type: 'progress', value: 10 });

        let progress = 10;
        const progressInterval = setInterval(() => {
            if (progress < 80) {
                progress += Math.floor(Math.random() * 15);
                self.postMessage({ type: 'progress', value: progress });
            }
        }, 200);

        const res = await fetch(`${checkUrl}?port=${port}`);

        clearInterval(progressInterval);
        self.postMessage({ type: 'progress', value: 90 });

        const data = await res.json();

        if (res.ok) {
            self.postMessage({ type: 'progress', value: 100 });
            setTimeout(() => {
                self.postMessage({ type: 'result', data });
            }, 200); // Small delay to let user see 100%
        } else {
            self.postMessage({ type: 'error', error: data.error || "Failed to check port" });
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', error: err.message || "Network error" });
    }
};
