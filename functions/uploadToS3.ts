import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from 'npm:@aws-sdk/client-s3@3.700.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { action, fileName, uploadId, fileKey, partNumber, chunkBase64, parts } = body;

        const s3Client = new S3Client({
            region: 'us-east-1',
            endpoint: `https://${Deno.env.get('DREAMHOST_ENDPOINT')}`,
            credentials: {
                accessKeyId: Deno.env.get('DREAMHOST_ACCESS_KEY'),
                secretAccessKey: Deno.env.get('DREAMHOST_SECRET_KEY'),
            },
            forcePathStyle: true,
        });

        const bucket = Deno.env.get('DREAMHOST_BUCKET');

        if (action === 'start') {
            const fileKey = `${user.id}/${Date.now()}_${fileName}`;

            const command = new CreateMultipartUploadCommand({
                Bucket: bucket,
                Key: fileKey,
            });

            const response = await s3Client.send(command);
            return Response.json({ 
                uploadId: response.UploadId,
                fileKey: fileKey
            });
        }

        if (action === 'upload') {
            // Decode base64 chunk
            const chunkBuffer = Uint8Array.from(atob(chunkBase64), c => c.charCodeAt(0));

            const command = new UploadPartCommand({
                Bucket: bucket,
                Key: fileKey,
                UploadId: uploadId,
                PartNumber: parseInt(partNumber),
                Body: chunkBuffer,
            });

            const response = await s3Client.send(command);
            return Response.json({ 
                ETag: response.ETag,
                PartNumber: parseInt(partNumber)
            });
        }

        if (action === 'complete') {
            const command = new CompleteMultipartUploadCommand({
                Bucket: bucket,
                Key: fileKey,
                UploadId: uploadId,
                MultipartUpload: { Parts: parts },
            });

            await s3Client.send(command);
            
            const fileUrl = `https://${Deno.env.get('DREAMHOST_ENDPOINT')}/${bucket}/${fileKey}`;
            
            return Response.json({ 
                success: true,
                fileUrl: fileUrl,
                fileKey: fileKey
            });
        }

        return Response.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});