"use client";

import { useState, useRef } from "react";
import Link from "next/link";

export default function ImageConverter() {
    const [image, setImage] = useState<string | null>(null);
    const [convertedImage, setConvertedImage] = useState<string | null>(null);
    const [quality, setQuality] = useState(0.8);
    const [format, setFormat] = useState<"image/webp" | "image/jpeg" | "image/png">("image/webp");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setImage(event.target?.result as string);
                setConvertedImage(null); // Reset converted image
            };
            reader.readAsDataURL(file);
        }
    };

    const processImage = () => {
        if (!image) return;

        const img = new Image();
        img.src = image;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL(format, quality);
                setConvertedImage(dataUrl);
            }
        };
    };

    const downloadImage = () => {
        if (!convertedImage) return;
        const link = document.createElement("a");
        link.href = convertedImage;
        link.download = `converted-image.${format.split("/")[1]}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Image Converter</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full">

                {/* Controls */}
                <div className="flex flex-col md:flex-row gap-6 p-6 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div className="flex-1 flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Upload Image</label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700"
                        />
                    </div>

                    <div className="flex-1 flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Format</label>
                        <select
                            value={format}
                            onChange={(e) => setFormat(e.target.value as any)}
                            className="rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                        >
                            <option value="image/webp">WebP (Best Compression)</option>
                            <option value="image/jpeg">JPEG</option>
                            <option value="image/png">PNG</option>
                        </select>
                    </div>

                    <div className="flex-1 flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Quality ({Math.round(quality * 100)}%)</label>
                        <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.1"
                            value={quality}
                            onChange={(e) => setQuality(parseFloat(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={processImage}
                            disabled={!image}
                            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Convert
                        </button>
                    </div>
                </div>

                {/* Previews */}
                <div className="flex flex-col md:flex-row gap-6">
                    {image && (
                        <div className="flex-1 flex flex-col gap-2">
                            <h2 className="text-sm font-medium text-zinc-400">Original</h2>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 flex items-center justify-center min-h-[300px]">
                                <img src={image} alt="Original" className="max-w-full max-h-[400px] object-contain" />
                            </div>
                        </div>
                    )}

                    {convertedImage && (
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-medium text-zinc-400">Converted Output</h2>
                                <button
                                    onClick={downloadImage}
                                    className="text-xs text-green-400 hover:text-green-300 font-bold"
                                >
                                    Download
                                </button>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 flex items-center justify-center min-h-[300px]">
                                <img src={convertedImage} alt="Converted" className="max-w-full max-h-[400px] object-contain" />
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
