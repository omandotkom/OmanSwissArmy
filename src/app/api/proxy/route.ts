import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { url, method, headers, body } = await req.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Filter out headers that might cause issues or are managed by the browser/fetch
        const cleanHeaders: Record<string, string> = {};
        if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    cleanHeaders[key] = value;
                }
            });
        }

        const options: RequestInit = {
            method,
            headers: cleanHeaders,
        };

        if (body && !['GET', 'HEAD'].includes(method)) {
            options.body = body;
        }

        const response = await fetch(url, options);

        const contentType = response.headers.get("content-type") || "";
        const isBinary = contentType.startsWith("image/") || contentType.includes("application/pdf");

        let responseData;
        if (isBinary) {
            const arrayBuffer = await response.arrayBuffer();
            responseData = Buffer.from(arrayBuffer).toString('base64');
        } else {
            const responseText = await response.text();
            try {
                responseData = JSON.parse(responseText);
            } catch {
                responseData = responseText;
            }
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        return NextResponse.json({
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            data: responseData,
            isBinary,
            contentType,
        });

    } catch (error: unknown) {
        const err = error as Error;
        return NextResponse.json({
            error: err.message,
            status: 500,
            statusText: 'Internal Server Error'
        }, { status: 500 });
    }
}
