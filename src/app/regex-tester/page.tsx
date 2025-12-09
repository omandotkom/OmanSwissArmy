"use client";

import { useState } from "react";
import Link from "next/link";

interface Match {
    index: number;
    value: string;
    groups: string[];
}

export default function RegexTester() {
    const [regex, setRegex] = useState("");
    const [flags, setFlags] = useState("g");
    const [text, setText] = useState("");
    const [matches, setMatches] = useState<Match[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [explanation, setExplanation] = useState<{ token: string; meaning: string }[]>([]);

    const explainRegex = (pattern: string) => {
        const explanations: { token: string; meaning: string }[] = [];
        let i = 0;

        while (i < pattern.length) {
            const char = pattern[i];

            if (char === "\\") {
                if (i + 1 < pattern.length) {
                    const next = pattern[i + 1];
                    let meaning = `Escaped character '${next}'`;
                    if (next === "d") meaning = "Any digit [0-9]";
                    else if (next === "D") meaning = "Any non-digit";
                    else if (next === "w") meaning = "Any word character [a-zA-Z0-9_]";
                    else if (next === "W") meaning = "Any non-word character";
                    else if (next === "s") meaning = "Any whitespace character";
                    else if (next === "S") meaning = "Any non-whitespace character";
                    else if (next === "b") meaning = "Word boundary";
                    else if (next === "B") meaning = "Non-word boundary";

                    explanations.push({ token: `\\${next}`, meaning });
                    i += 2;
                    continue;
                }
            }

            if (char === "^") explanations.push({ token: "^", meaning: "Start of string/line" });
            else if (char === "$") explanations.push({ token: "$", meaning: "End of string/line" });
            else if (char === ".") explanations.push({ token: ".", meaning: "Any character (except newline)" });
            else if (char === "*") explanations.push({ token: "*", meaning: "Zero or more times" });
            else if (char === "+") explanations.push({ token: "+", meaning: "One or more times" });
            else if (char === "?") explanations.push({ token: "?", meaning: "Zero or one time" });
            else if (char === "|") explanations.push({ token: "|", meaning: "OR / Alternation" });
            else if (char === "(") explanations.push({ token: "(", meaning: "Start capturing group" });
            else if (char === ")") explanations.push({ token: ")", meaning: "End capturing group" });
            else if (char === "[") explanations.push({ token: "[", meaning: "Start character set" });
            else if (char === "]") explanations.push({ token: "]", meaning: "End character set" });
            else if (char === "{") explanations.push({ token: "{", meaning: "Start quantifier" });
            else if (char === "}") explanations.push({ token: "}", meaning: "End quantifier" });
            else explanations.push({ token: char, meaning: `Literal character '${char}'` });

            i++;
        }
        setExplanation(explanations);
    };

    const testRegex = (currentRegex: string, currentFlags: string, currentText: string) => {
        setError(null);
        if (!currentRegex) {
            setMatches([]);
            setExplanation([]);
            return;
        }

        try {
            const re = new RegExp(currentRegex, currentFlags);
            const newMatches: Match[] = [];
            let match;

            // Prevent infinite loops with empty matches
            if (currentRegex === "") return;

            if (currentFlags.includes("g")) {
                while ((match = re.exec(currentText)) !== null) {
                    newMatches.push({
                        index: match.index,
                        value: match[0],
                        groups: match.slice(1)
                    });
                    if (match.index === re.lastIndex) {
                        re.lastIndex++;
                    }
                }
            } else {
                match = re.exec(currentText);
                if (match) {
                    newMatches.push({
                        index: match.index,
                        value: match[0],
                        groups: match.slice(1)
                    });
                }
            }
            setMatches(newMatches);
        } catch (e) {
            const error = e as Error;
            setError(error.message);
            setMatches([]);
        }
    };

    const handleRegexChange = (val: string) => {
        setRegex(val);
        testRegex(val, flags, text);
        explainRegex(val);
    };

    const handleFlagsChange = (val: string) => {
        setFlags(val);
        testRegex(regex, val, text);
    };

    const handleTextChange = (val: string) => {
        setText(val);
        testRegex(regex, flags, val);
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Regex Tester</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">

                {/* Regex Input */}
                <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3">
                        <span className="text-zinc-500 font-mono text-lg">/</span>
                        <input
                            type="text"
                            placeholder="Regular Expression"
                            value={regex}
                            onChange={(e) => handleRegexChange(e.target.value)}
                            className="flex-1 bg-transparent font-mono text-lg text-zinc-200 focus:outline-none"
                        />
                        <span className="text-zinc-500 font-mono text-lg">/</span>
                        <input
                            type="text"
                            placeholder="flags"
                            value={flags}
                            onChange={(e) => handleFlagsChange(e.target.value)}
                            className="w-16 bg-transparent font-mono text-lg text-zinc-400 focus:outline-none"
                        />
                    </div>
                </div>
                {error && <div className="text-red-400 text-sm px-2">{error}</div>}

                {/* Regex Explanation */}
                {explanation.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <h2 className="text-sm font-medium text-zinc-400">Regex Explanation</h2>
                        <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                            {explanation.map((item, i) => (
                                <div key={i} className="flex flex-col items-center rounded bg-zinc-950 border border-zinc-800 px-3 py-2 min-w-[60px]">
                                    <span className="font-mono text-lg font-bold text-blue-400 mb-1">{item.token}</span>
                                    <span className="text-[10px] text-zinc-500 text-center leading-tight max-w-[100px]">{item.meaning}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Test String */}
                <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-medium text-zinc-400">Test String</h2>
                    <textarea
                        value={text}
                        onChange={(e) => handleTextChange(e.target.value)}
                        className="h-[200px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
                        placeholder="Paste your text here to test against the regex..."
                    />
                </div>

                {/* Matches */}
                <div className="flex flex-col gap-2">
                    <h2 className="text-sm font-medium text-zinc-400">Matches ({matches.length})</h2>
                    <div className="flex flex-col gap-2">
                        {matches.map((match, i) => (
                            <div key={i} className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 font-mono text-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="text-blue-400 font-bold">Match {i + 1}</span>
                                    <span className="text-zinc-500 text-xs">Index: {match.index}</span>
                                </div>
                                <div className="bg-zinc-950 p-2 rounded border border-zinc-800/50 text-zinc-300">
                                    {match.value}
                                </div>
                                {match.groups.length > 0 && (
                                    <div className="mt-2 pl-4 border-l-2 border-zinc-800">
                                        {match.groups.map((group: string, j: number) => (
                                            <div key={j} className="text-xs text-zinc-400">
                                                Group {j + 1}: <span className="text-green-400">{group}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {matches.length === 0 && text && !error && (
                            <div className="text-zinc-500 italic px-2">No matches found.</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
