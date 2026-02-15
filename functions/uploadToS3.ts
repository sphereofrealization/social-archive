import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from 'npm:@aws-sdk/client-s3@3.700.0';

Deno.serve(async (req) => {
    try {
        const body = await req.json();
        
        // Validate session token
        const sessionToken = req.headers.get('Authorization')?.replace('Bearer ', '');
        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        const validateResponse = await base44.functions.invoke('passwordlessAuth', {
            action: 'validate',
            sessionToken
        });
        
        // Destructure safely and validate
        const { accountId, userId, valid } = validateResponse.data || {};
        
        if (!valid) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        // Get accountId (or fallback to userId for backward compatibility)
        const folder = accountId || userId;
        
        if (!folder) {
            return Response.json({ 
                error: 'Missing accountId from passwordlessAuth.validate' 
            }, { status: 500 });
        }

        const { action, fileName, uploadId, fileKey, partNumber, chunkBase64, parts } = body;
        
        console.log('Upload action:', action, 'folder:', folder);

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
            // Sanitize filename to avoid slashes or weird characters
            const safeName = fileName.replace(/[^\w.\-]+/g, "_");
            const fileKey = `${folder}/${Date.now()}_${safeName}`;

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
            // Security: Prevent cross-account key injection
            if (!fileKey || !fileKey.startsWith(folder + '/')) {
                return Response.json({ 
                    error: 'fileKey does not match authenticated account' 
                }, { status: 403 });
            }
            
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
            // Security: Prevent cross-account key injection
            if (!fileKey || !fileKey.startsWith(folder + '/')) {
                return Response.json({ 
                    error: 'fileKey does not match authenticated account' 
                }, { status: 403 });
            }
            
            const command = new CompleteMultipartUploadCommand({
                Bucket: bucket,
                Key: fileKey,
                UploadId: uploadId,
                MultipartUpload: { Parts: parts },
            });

            await s3Client.send(command);
            
            // Generate a publicly accessible URL (DreamHost format)
            const endpoint = Deno.env.get('DREAMHOST_ENDPOINT');
            const fileUrl = `https://${bucket}.${endpoint}/${fileKey}`;
            
            console.log('Upload complete, file URL:', fileUrl);
            
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