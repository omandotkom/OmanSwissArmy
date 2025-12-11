"use client";

import { useState, useEffect, useRef } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

interface ProjectSelectorProps {
    projects: string[];
    selectedProject: string;
    onSelect: (project: string) => void;
    placeholder?: string;
    label?: string;
}

export function ProjectSelector({
    projects,
    selectedProject,
    onSelect,
    placeholder = "Select Project",
    label = "Select Project"
}: ProjectSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter projects based on search term
    const uniqueProjects = Array.from(new Set(projects)).sort();
    const filteredProjects = uniqueProjects.filter(p =>
        p.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Provide a way to clear selection
    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect("");
        setSearchTerm("");
    };

    return (
        <div className="w-full space-y-2" ref={wrapperRef}>
            {label && <label className="text-sm font-medium text-slate-400 block ml-1">{label}</label>}

            <div className="relative">
                {/* Trigger Button / Input Area */}
                <div
                    onClick={() => {
                        setIsOpen(!isOpen);
                        if (!isOpen) setTimeout(() => inputRef.current?.focus(), 100);
                    }}
                    className={`
                        w-full bg-slate-900 border border-slate-800 rounded-xl p-3 
                        flex items-center justify-between cursor-pointer transition-all
                        ${isOpen ? 'ring-2 ring-orange-500/50 border-orange-500/50' : 'hover:border-slate-700'}
                    `}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Search size={16} className="text-slate-500 shrink-0" />
                        {selectedProject ? (
                            <span className="text-slate-200 truncate">{selectedProject}</span>
                        ) : (
                            <span className="text-slate-500 italic">{placeholder}</span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedProject && (
                            <div
                                onClick={handleClear}
                                className="p-1 hover:bg-slate-800 rounded-full text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                <X size={14} />
                            </div>
                        )}
                        <ChevronDown
                            size={16}
                            className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                    </div>
                </div>

                {/* Dropdown Menu */}
                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Search Input inside dropdown */}
                        <div className="p-2 border-b border-slate-800">
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Filter projects..."
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-orange-500/50 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>

                        {/* List */}
                        <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                            {filteredProjects.length > 0 ? (
                                filteredProjects.map((project) => (
                                    <div
                                        key={project}
                                        onClick={() => {
                                            onSelect(project);
                                            setIsOpen(false);
                                            setSearchTerm("");
                                        }}
                                        className={`
                                            flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors
                                            ${selectedProject === project
                                                ? 'bg-orange-500/10 text-orange-500'
                                                : 'text-slate-300 hover:bg-slate-800'
                                            }
                                        `}
                                    >
                                        <span className="truncate">{project}</span>
                                        {selectedProject === project && <Check size={14} />}
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-slate-500 text-sm italic">
                                    No projects found matching "{searchTerm}"
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Add this to your globals.css if not present for nicer scrollbars
/*
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #334155;
  border-radius: 20px;
}
*/
