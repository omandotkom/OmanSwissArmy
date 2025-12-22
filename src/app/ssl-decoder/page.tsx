'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Upload, Globe, FileText, CheckCircle, AlertTriangle, AlertCircle, Loader2, Copy } from 'lucide-react';
import forge from 'node-forge';

export default function SSLDecoderPage() {
    const [mode, setMode] = useState<'paste' | 'upload' | 'url'>('paste');
    const [inputText, setInputText] = useState('');
    const [urlHost, setUrlHost] = useState('');
    const [urlPort, setUrlPort] = useState(443);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [decoded, setDecoded] = useState<any>(null);

    // --- Core Decoding Logic using node-forge ---
    const decodeCert = (pem: string, source: string = 'Manual Input') => {
        try {
            setError(null);
            // Clean up headers if raw paste contains mess
            let cleanPem = pem;
            if (!cleanPem.includes('-----BEGIN CERTIFICATE-----')) {
                // Try to wrap if user pasted just base64, usually users paste full block though.
                // For now assumes standard PEM or allow forge to try parsing.
            }

            const pki = forge.pki;
            const cert = pki.certificateFromPem(cleanPem);

            // Extract Details
            const issuer = cert.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', ');
            const subject = cert.subject.attributes.map(a => `${a.shortName}=${a.value}`).join(', ');
            const commonName = cert.subject.getField('CN')?.value || 'Unknown CN';

            const validFrom = cert.validity.notBefore;
            const validTo = cert.validity.notAfter;

            // Calculate Days Remaining
            const now = new Date();
            const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            const isExpired = now > validTo;
            const isNotYetValid = now < validFrom;

            // SANs
            const altNames = (cert.getExtension('subjectAltName') as any)?.altNames || [];
            const sanList = altNames.map((a: any) => a.value);

            // Fingerprints
            const der = forge.asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
            const md = forge.md.sha1.create();
            md.update(der);
            const fingerprintSHA1 = md.digest().toHex().toUpperCase().match(/.{2}/g)?.join(':');

            const md256 = forge.md.sha256.create();
            md256.update(der);
            const fingerprintSHA256 = md256.digest().toHex().toUpperCase().match(/.{2}/g)?.join(':');

            setDecoded({
                source,
                commonName,
                subject,
                issuer,
                validFrom,
                validTo,
                daysRemaining,
                isExpired,
                isNotYetValid,
                sanList,
                fingerprintSHA1,
                fingerprintSHA256,
                serialNumber: cert.serialNumber,
                rawPem: cleanPem
            });

        } catch (e: any) {
            console.error(e);
            setError("Failed to decode certificate. Please ensure input is a valid PEM format (starts with -----BEGIN CERTIFICATE-----).");
            setDecoded(null);
        }
    };

    // --- Handlers ---

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const content = evt.target?.result as string;
            decodeCert(content, `File: ${file.name}`);
        };
        reader.readAsText(file);
    };

    const handleUrlCheck = async () => {
        if (!urlHost) return;
        setLoading(true);
        setError(null);
        setDecoded(null);

        try {
            const res = await fetch('/api/utils/ssl-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host: urlHost, port: urlPort })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch certificate');
            }

            // HYBRID STRATEGY: Use backend details if available (Best for ECC & Host checks)
            if (data.details) {
                const d = data.details;
                const validFrom = new Date(d.valid_from);
                const validTo = new Date(d.valid_to);
                const now = new Date();
                const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                // Helper to format Subject/Issuer object from Node.js
                const formatEntity = (ent: any) => {
                    if (!ent) return 'Unknown';
                    if (typeof ent === 'string') return ent;
                    return Object.entries(ent).map(([k, v]) => `${k}=${v}`).join(', ');
                };

                // Helper for SANs (Node.js returns string "DNS:a.com, DNS:b.com")
                let sanList: string[] = [];
                if (d.subjectaltname && typeof d.subjectaltname === 'string') {
                    sanList = d.subjectaltname.split(', ').map((s: string) => s.replace('DNS:', ''));
                }

                setDecoded({
                    source: `URL: ${urlHost}:${urlPort}`,
                    commonName: d.subject?.CN || 'Unknown CN',
                    subject: formatEntity(d.subject),
                    issuer: formatEntity(d.issuer),
                    validFrom,
                    validTo,
                    daysRemaining,
                    isExpired: now > validTo,
                    isNotYetValid: now < validFrom,
                    sanList,
                    fingerprintSHA1: d.fingerprint,
                    fingerprintSHA256: d.fingerprint256,
                    serialNumber: d.serialNumber,
                    rawPem: data.pem
                });

            } else {
                // Fallback: Try decoding PEM locally (e.g. if backend logic changes)
                decodeCert(data.pem, `URL: ${urlHost}:${urlPort}`);
            }

        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-emerald-500/10 rounded-xl">
                    <Shield className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white">SSL/TLS Decoder</h1>
                    <p className="text-zinc-400">Decode certificates, check expiry dates, and validate chains.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* --- Left Panel: Input --- */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Tabs */}
                    <div className="flex p-1 bg-zinc-900 rounded-lg">
                        <button
                            onClick={() => setMode('paste')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'paste' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Paste
                        </button>
                        <button
                            onClick={() => setMode('upload')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'upload' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Upload
                        </button>
                        <button
                            onClick={() => setMode('url')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'url' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Check URL
                        </button>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 min-h-[400px]">
                        {mode === 'paste' && (
                            <div className="h-full flex flex-col gap-4">
                                <label className="text-sm text-zinc-400">Paste your certificate (PEM format)</label>
                                <textarea
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none whitespace-pre"
                                    placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                                    value={inputText}
                                    onChange={(e) => {
                                        setInputText(e.target.value);
                                        if (e.target.value.includes("BEGIN CERTIFICATE")) {
                                            decodeCert(e.target.value, "Manual Input");
                                        }
                                    }}
                                />
                            </div>
                        )}

                        {mode === 'upload' && (
                            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl hover:border-zinc-700 hover:bg-zinc-800/20 transition-all">
                                <Upload className="w-12 h-12 text-zinc-600 mb-4" />
                                <p className="text-zinc-400 font-medium mb-2">Drag & Drop certificate here</p>
                                <p className="text-xs text-zinc-600 mb-6">Supported: .pem, .crt, .cer</p>
                                <label className="cursor-pointer px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors">
                                    Browse Files
                                    <input type="file" className="hidden" accept=".pem,.crt,.cer,.txt" onChange={handleFileUpload} />
                                </label>
                            </div>
                        )}

                        {mode === 'url' && (
                            <div className="h-full flex flex-col gap-6 pt-10">
                                <div className="space-y-2">
                                    <label className="text-sm text-zinc-400">Hostname / URL</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                            <input
                                                type="text"
                                                placeholder="example.com"
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                                                value={urlHost}
                                                onChange={(e) => setUrlHost(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleUrlCheck()}
                                            />
                                        </div>
                                        <input
                                            type="number"
                                            className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg py-2 px-3 text-white text-center"
                                            value={urlPort}
                                            onChange={(e) => setUrlPort(Number(e.target.value))}
                                        />
                                    </div>
                                    <p className="text-xs text-zinc-600">Default port is 443 (HTTPS)</p>
                                </div>

                                <button
                                    onClick={handleUrlCheck}
                                    disabled={loading || !urlHost}
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex justify-center items-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                                    Check SSL Status
                                </button>
                            </div>
                        )}
                    </div>
                    {error && (
                        <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-200">{error}</p>
                        </div>
                    )}
                </div>

                {/* --- Right Panel: Result --- */}
                <div className="lg:col-span-7">
                    {decoded ? (
                        <div className="space-y-6 animate-in slide-in-from-right duration-500">
                            {/* Summary Card */}
                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl relative overflow-hidden">
                                <div className={`absolute top-0 right-0 p-4 ${decoded.isExpired ? 'bg-red-500/10' : decoded.daysRemaining < 30 ? 'bg-yellow-500/10' : 'bg-emerald-500/10'} rounded-bl-2xl border-b border-l ${decoded.isExpired ? 'border-red-500/20' : decoded.daysRemaining < 30 ? 'border-yellow-500/20' : 'border-emerald-500/20'}`}>
                                    <div className="flex flex-col items-end">
                                        <span className={`text-sm font-bold ${decoded.isExpired ? 'text-red-400' : decoded.daysRemaining < 30 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                            {decoded.isExpired ? 'EXPIRED' : 'VALID'}
                                        </span>
                                        <span className="text-xs text-zinc-500">
                                            {decoded.isExpired
                                                ? `Expired ${Math.abs(decoded.daysRemaining)} days ago`
                                                : `Expires in ${decoded.daysRemaining} days`}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1 mb-6">
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                        {decoded.commonName}
                                        {decoded.isExpired ? <AlertTriangle className="text-red-500 w-6 h-6" /> : <CheckCircle className="text-emerald-500 w-6 h-6" />}
                                    </h2>
                                    <p className="text-sm text-zinc-400 font-mono">{decoded.source}</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wider text-zinc-600 font-bold">Issuer</label>
                                        <p className="text-sm text-zinc-300 break-words">{decoded.issuer}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wider text-zinc-600 font-bold">Serial Number</label>
                                        <p className="text-xs font-mono text-zinc-300 break-all">{decoded.serialNumber}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wider text-zinc-600 font-bold">Valid From</label>
                                        <p className="text-sm text-zinc-300">{decoded.validFrom.toLocaleString()}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wider text-zinc-600 font-bold">Valid To</label>
                                        <p className={`text-sm font-bold ${decoded.isExpired ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {decoded.validTo.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* SANs */}
                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-blue-500" />
                                    Subject Alternative Names (SANs)
                                </h3>
                                <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto custom-scrollbar">
                                    {decoded.sanList.length > 0 ? decoded.sanList.map((san: string, idx: number) => (
                                        <span key={idx} className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300 border border-zinc-700">
                                            {san}
                                        </span>
                                    )) : <span className="text-zinc-500 italic">No alternative names found.</span>}
                                </div>
                            </div>

                            {/* Fingerprints */}
                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-purple-500" />
                                    Fingerprints
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <label className="text-xs uppercase tracking-wider text-zinc-600 font-bold">SHA-256</label>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(decoded.fingerprintSHA256)}
                                                className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1"
                                            >
                                                <Copy className="w-3 h-3" /> Copy
                                            </button>
                                        </div>
                                        <p className="text-xs font-mono text-zinc-400 break-all bg-zinc-950 p-2 rounded border border-zinc-800">
                                            {decoded.fingerprintSHA256}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wider text-zinc-600 font-bold">SHA-1</label>
                                        <p className="text-xs font-mono text-zinc-500 break-all">
                                            {decoded.fingerprintSHA1}
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-600 p-12 border border-zinc-900 rounded-xl border-dashed">
                            <Shield className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-lg font-medium">No certificate decoded yet</p>
                            <p className="text-sm">Paste a PEM text, upload a file, or check a URL to see details.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
