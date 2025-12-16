
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    // A temporary fix to allow self-signed certificates
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const targetUrl = req.nextUrl.searchParams.get('url');
    const authHeader = req.headers.get('Authorization');

    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing target URL parameter' }, { status: 400 });
    }

    if (!authHeader) {
        return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    try {
        console.log(`Proxying request to Gitea: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            cache: 'no-store' // Don't cache API responses
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gitea API Error (${response.status}): ${errorText}`);
            return NextResponse.json({
                error: `Gitea API returned ${response.status}: ${response.statusText}`,
                details: errorText
            }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: unknown) {
        console.error("Proxy Error:", error);
        const err = error as Error;
        return NextResponse.json({ error: 'Proxy Request Failed', details: err.message }, { status: 500 });
    }
}
