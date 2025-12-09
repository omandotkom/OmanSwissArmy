export const isDesktopApp = (): boolean => {
    if (typeof window === 'undefined') return false;

    // Check for Electron
    const isElectron =
        // @ts-expect-error: `process` is injected by Electron
        (window.process && window.process.versions && window.process.versions.electron) ||
        navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

    // Check for Tauri
    // @ts-expect-error: `__TAURI__` is injected by Tauri
    const isTauri = window.__TAURI__ !== undefined;

    return !!(isElectron || isTauri);
};
