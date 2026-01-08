
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();
        if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

        const text = await response.text();
        return NextResponse.json({ content: text });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
