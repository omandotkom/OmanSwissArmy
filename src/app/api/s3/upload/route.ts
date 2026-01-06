import { NextRequest, NextResponse } from 'next/server';
import { S3Service, S3Config } from '@/lib/s3-helper';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const bucketName = formData.get('bucketName') as string;
        const key = formData.get('key') as string;
        const configJson = formData.get('config') as string;

        if (!file || !bucketName || !key || !configJson) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const config: S3Config = JSON.parse(configJson);
        const service = new S3Service(config);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        await service.uploadFile(bucketName, key, buffer, file.type);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Upload proxy error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
