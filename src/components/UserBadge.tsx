"use client";

import { useState, useEffect } from 'react';
import { User, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

interface UserInfo {
    username: string;
    role: string;
    permissions: {
        isAdmin: boolean;
        canReadNodes: boolean;
        canReadPVs: boolean;
    };
}

export function UserBadge() {
    const [info, setInfo] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/oc/user-info')
            .then(res => res.json())
            .then(data => {
                if (data.username) setInfo(data);
            })
            .catch(() => { }) // Silently fail
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="animate-pulse bg-slate-800 h-8 w-24 rounded-full"></div>;
    if (!info) return null;

    let BadgeIcon = User;
    let badgeColor = "bg-slate-800 text-slate-300 border-slate-700";

    if (info.role === 'Cluster Admin') {
        BadgeIcon = ShieldAlert;
        badgeColor = "bg-red-500/20 text-red-500 border-red-500/50 shadow-red-500/20 shadow-lg";
    } else if (info.role === 'Cluster Reader' || info.role === 'Storage Viewer') {
        BadgeIcon = ShieldCheck;
        badgeColor = "bg-blue-500/20 text-blue-400 border-blue-500/50";
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${badgeColor} transition-all`}>
            <BadgeIcon size={14} />
            <div className="flex flex-col leading-none">
                <span>{info.username}</span>
                <span className="text-[10px] opacity-75 font-normal uppercase tracking-wide mt-0.5">{info.role}</span>
            </div>
        </div>
    );
}
