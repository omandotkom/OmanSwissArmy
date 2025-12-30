"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackActivity, initTrackerUser } from "@/lib/tracker";

export default function ActivityTracker() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // 0. Init User Info
    useEffect(() => {
        initTrackerUser();
    }, []);

    // 1. Track Page Views (Pindah Halaman)
    useEffect(() => {
        // Gabungkan pathname dan query params (opsional, agar tahu filter yang dipakai)
        const fullUrl = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");

        trackActivity({
            action: "PAGE_VIEW",
            label: fullUrl
        });
    }, [pathname, searchParams]);

    // 2. Track Clicks (Tombol & Link) - DISABLED (User Request: Manual Tracking Only)
    // useEffect(() => { ... }) code removed to prevent auto-tracking


    return null; // Komponen ini tidak merender visual apapun
}
