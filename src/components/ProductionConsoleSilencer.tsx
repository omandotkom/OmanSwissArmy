"use client";

import { useEffect } from "react";

/**
 * Komponen ini berfungsi untuk mematikan semua output console
 * (log, warn, error, info) ketika aplikasi berjalan di mode PRODUCTION.
 * Tujuannya agar user biasa/hacker tidak melihat log debugging.
 */
export default function ProductionConsoleSilencer() {
    useEffect(() => {
        if (process.env.NODE_ENV === "production") {
            const noop = () => { };

            // Simpan referensi asli jika nanti butuh restore (opsional, saat ini tidak dipakai)
            // const originalConsole = { ...console };

            console.log = noop;
            console.warn = noop;
            console.error = noop;
            console.info = noop;
            console.debug = noop;
        }
    }, []);

    return null; // Component ini tidak merender apa-apa
}
