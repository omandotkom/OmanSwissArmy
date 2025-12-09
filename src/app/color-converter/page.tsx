"use client";

import { useState } from "react";
import Link from "next/link";

export default function ColorConverter() {
    const [hex, setHex] = useState("#3b82f6");
    const [rgb, setRgb] = useState("rgb(59, 130, 246)");
    const [hsl, setHsl] = useState("hsl(217, 91%, 60%)");
    const [color, setColor] = useState("#3b82f6");

    // Conversion Helpers
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    const rgbToHsl = (r: number, g: number, b: number) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s;
        const l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    };

    const rgbToHex = (r: number, g: number, b: number) => {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };

    const handleHexChange = (val: string) => {
        setHex(val);
        if (/^#[0-9A-F]{6}$/i.test(val)) {
            setColor(val);
            const rgbVal = hexToRgb(val);
            if (rgbVal) {
                setRgb(`rgb(${rgbVal.r}, ${rgbVal.g}, ${rgbVal.b})`);
                const hslVal = rgbToHsl(rgbVal.r, rgbVal.g, rgbVal.b);
                setHsl(`hsl(${hslVal.h}, ${hslVal.s}%, ${hslVal.l}%)`);
            }
        }
    };

    const handleRgbChange = (val: string) => {
        setRgb(val);
        const match = val.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const hexVal = rgbToHex(r, g, b);
            setHex(hexVal);
            setColor(hexVal);
            const hslVal = rgbToHsl(r, g, b);
            setHsl(`hsl(${hslVal.h}, ${hslVal.s}%, ${hslVal.l}%)`);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Color Converter</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">

                {/* Color Preview */}
                <div
                    className="h-32 w-full rounded-xl shadow-lg transition-all duration-300 border border-zinc-800"
                    style={{ backgroundColor: color }}
                />

                <div className="flex flex-col gap-6 p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">

                    {/* HEX Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">HEX</label>
                        <input
                            type="text"
                            value={hex}
                            onChange={(e) => handleHexChange(e.target.value)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="#000000"
                        />
                    </div>

                    {/* RGB Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">RGB</label>
                        <input
                            type="text"
                            value={rgb}
                            onChange={(e) => handleRgbChange(e.target.value)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="rgb(0, 0, 0)"
                        />
                    </div>

                    {/* HSL Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">HSL</label>
                        <input
                            type="text"
                            value={hsl}
                            readOnly
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-zinc-400 focus:outline-none cursor-not-allowed"
                        />
                        <span className="text-xs text-zinc-500 text-right">HSL editing not yet supported (read-only)</span>
                    </div>

                </div>

            </div>
        </div>
    );
}
