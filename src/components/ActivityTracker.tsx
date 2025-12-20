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

    // 2. Track Clicks (Tombol & Link)
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            // Cari elemen terdekat yang bisa diklik (Button atau Anchor) dari target klik
            const target = (e.target as HTMLElement).closest('button, a');

            if (target) {
                const element = target as HTMLElement;

                // --- SMART LABEL EXTRACTION ---
                let label = "";

                // 1. Coba cari Heading atau elemen Text tebal (biasanya judul Card)
                const heading = element.querySelector('h1, h2, h3, h4, .font-bold, .font-semibold');
                if (heading && heading.textContent) {
                    label = heading.textContent;
                }

                // 2. Jika tidak ada heading, cek aria-label atau title (aksesibilitas biasanya akurat)
                if (!label) {
                    label = element.getAttribute("aria-label") || element.getAttribute("title") || "";
                }

                // 3. Jika masih kosong, ambil semua text content
                if (!label) {
                    label = element.innerText || element.textContent || "";
                }

                // --- CLEANUP ---
                // Ganti newline dengan spasi, dan hapus spasi berlebih
                label = label.replace(/\s+/g, ' ').trim();

                // Fallback jika tombol isinya cuma Icon
                if (!label) {
                    label = "Icon Button"; // Bisa diperbaiki dengan melihat nama icon class jika perlu
                }

                // Potong jika terlalu panjang (max 60 chars), kasih ellipsis
                if (label.length > 60) {
                    label = label.substring(0, 60) + "...";
                }

                trackActivity({
                    action: "CLICK",
                    label: label,
                    details: {
                        tagName: element.tagName,
                        id: element.id || undefined,
                        className: element.className ? element.className.substring(0, 100) : undefined, // Truncate classname juga biar log gak penuh
                        href: element.getAttribute("href") || undefined
                    }
                });
            }
        };

        // Pasang "telinga" di window
        window.addEventListener("click", handleClick);

        // Bersihkan saat unmount
        return () => window.removeEventListener("click", handleClick);
    }, []);

    return null; // Komponen ini tidak merender visual apapun
}
