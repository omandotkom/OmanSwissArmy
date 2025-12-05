export const isDesktopApp = (): boolean => {
    if (typeof window === 'undefined') return false;

    // Check for Electron
    const isElectron =
        // @ts-ignore
        (window.process && window.process.versions && window.process.versions.electron) ||
        navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

    // Check for Tauri
    // @ts-ignore
    const isTauri = window.__TAURI__ !== undefined;

    return !!(isElectron || isTauri);
};
