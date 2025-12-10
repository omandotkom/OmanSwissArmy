import { NextRequest, NextResponse } from 'next/server';
import { S3Service, S3Config } from '@/lib/s3-helper';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { endpoint, region, accessKeyId, secretAccessKey, bucketName, prefix } = body;

        if (!bucketName) {
            return NextResponse.json({ error: 'Bucket name required' }, { status: 400 });
        }

        const config: S3Config = {
            endpoint: endpoint || undefined,
            region: region || 'us-east-1',
            accessKeyId,
            secretAccessKey
        };

        const service = new S3Service(config);
        const files = await service.listFiles(bucketName, prefix || '');

        return NextResponse.json({ files });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
