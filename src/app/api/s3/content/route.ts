
import { NextResponse } from 'next/server';
import { S3Service } from '@/lib/s3-helper';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { endpoint, region, accessKeyId, secretAccessKey, bucketName, key } = body;

        if (!bucketName || !key) {
            return NextResponse.json({ error: 'Missing bucket or key' }, { status: 400 });
        }

        const s3 = new S3Service({ endpoint, region, accessKeyId, secretAccessKey });

        try {
            const buffer = await s3.getFileBuffer(bucketName, key);

            // Return as a downloadable stream with appropriate headers if needed, 
            // but for preview we want the raw content.
            // We can determine content-type or just default to octet-stream.
            // For text/code/office, the client logic handles the parsing of the arrayBuffer/text.

            return new NextResponse(Buffer.from(buffer), {
                status: 200,
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            });

        } catch (err: any) {
            console.error("S3 GetObject Error:", err);
            return NextResponse.json({ error: err.message || 'Failed to get object' }, { status: 500 });
        }

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
