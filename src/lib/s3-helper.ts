import { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import * as https from "https";

export interface S3Config {
    endpoint?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
}

export interface S3FileItem {
    name: string;
    key: string;
    lastModified?: Date;
    size: number;
    isDirectory: boolean;
}

export class S3Service {
    private client: S3Client;

    constructor(config: S3Config) {
        this.client = new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            },
            forcePathStyle: true, // Needed for many S3 compatible storages like MinIO/OpenShift
            requestHandler: new NodeHttpHandler({
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false // Allow self-signed certificates
                })
            })
        });
    }

    async listBuckets() {
        const command = new ListBucketsCommand({});
        const response = await this.client.send(command);
        return response.Buckets || [];
    }

    async listFiles(bucketName: string, prefix: string = '') {
        // Ensure prefix ends with / if it's not empty, to simulate folders
        const cleanPrefix = prefix === '' || prefix === '/' ? '' : (prefix.endsWith('/') ? prefix : `${prefix}/`);

        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: cleanPrefix,
            Delimiter: '/'
        });

        const response = await this.client.send(command);

        const items: S3FileItem[] = [];

        // Add Folders (CommonPrefixes)
        response.CommonPrefixes?.forEach(p => {
            if (p.Prefix) {
                const name = p.Prefix.replace(cleanPrefix, '').replace('/', '');
                items.push({
                    name: name,
                    key: p.Prefix,
                    size: 0,
                    isDirectory: true
                });
            }
        });

        // Add Files (Contents)
        response.Contents?.forEach(c => {
            if (c.Key && c.Key !== cleanPrefix) { // Skip the folder object itself if it exists
                const name = c.Key.replace(cleanPrefix, '');
                items.push({
                    name: name,
                    key: c.Key,
                    lastModified: c.LastModified,
                    size: c.Size || 0,
                    isDirectory: false
                });
            }
        });

        return items;
    }

    async getFilePresignedUrl(bucketName: string, key: string) {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        });
        // Presigned URL valid for 1 hour
        return await getSignedUrl(this.client, command, { expiresIn: 3600 });
    }

    async getBucketUsage(bucketName: string) {
        let totalSize = 0;
        let objectCount = 0;
        let fileTypeStats: Record<string, { count: number, size: number }> = {};
        let continuationToken: string | undefined = undefined;

        try {
            do {
                const command: ListObjectsV2Command = new ListObjectsV2Command({
                    Bucket: bucketName,
                    ContinuationToken: continuationToken
                });
                const response = await this.client.send(command);

                response.Contents?.forEach(c => {
                    const size = c.Size || 0;
                    totalSize += size;
                    objectCount++;

                    if (c.Key && !c.Key.endsWith('/')) {
                        const ext = c.Key.split('.').pop()?.toLowerCase() || 'unknown';
                        if (!fileTypeStats[ext]) fileTypeStats[ext] = { count: 0, size: 0 };
                        fileTypeStats[ext].count++;
                        fileTypeStats[ext].size += size;
                    }
                });

                continuationToken = response.NextContinuationToken;
            } while (continuationToken);

            return { totalSize, objectCount, fileTypeStats };
        } catch (error) {
            console.error("Error calculating usage:", error);
            throw error;
        }
    }

    async getFileBuffer(bucketName: string, key: string) {
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        });
        const response = await this.client.send(command);
        if (response.Body) {
            return response.Body.transformToByteArray();
        }
        throw new Error("Empty body");
    }
}
