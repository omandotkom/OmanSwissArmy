import { NextRequest, NextResponse } from 'next/server';
import { S3Service, S3Config } from '@/lib/s3-helper';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { endpoint, region, accessKeyId, secretAccessKey } = body;

        if (!accessKeyId || !secretAccessKey) {
            return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
        }

        const config: S3Config = {
            endpoint: endpoint || undefined, // Allow empty for AWS standard
            region: region || 'us-east-1',
            accessKeyId,
            secretAccessKey
        };

        const service = new S3Service(config);
        const buckets = await service.listBuckets();

        return NextResponse.json({ buckets });

    } catch (error: any) {
        console.error('List Buckets Error Details:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
