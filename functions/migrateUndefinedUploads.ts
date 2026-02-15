import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';

// Helper to derive accountId from sessionToken
async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Admin-only migration function
        if (user?.role !== 'admin') {
            return Response.json({ 
                error: 'Forbidden: Admin access required for migration' 
            }, { status: 403 });
        }

        const body = await req.json();
        const { sessionToken } = body;  // User must provide their session token to identify archives
        
        if (!sessionToken) {
            return Response.json({ 
                error: 'Missing sessionToken parameter' 
            }, { status: 400 });
        }

        // Derive the correct accountId for this user
        const accountId = await sha256Hex(sessionToken);
        
        console.log('Migration: Derived accountId:', accountId.substring(0, 10) + '...');

        // Find all archives with "undefined" in the file_url
        const allArchives = await base44.asServiceRole.entities.Archive.list();
        const undefinedArchives = allArchives.filter(a => 
            a.file_url && a.file_url.includes('/undefined/')
        );

        if (undefinedArchives.length === 0) {
            return Response.json({ 
                success: true,
                message: 'No archives found with undefined paths',
                migrated: []
            });
        }

        console.log(`Found ${undefinedArchives.length} archives with undefined paths`);

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
        const migrated = [];
        const errors = [];

        for (const archive of undefinedArchives) {
            try {
                // Extract the old key from file_url
                const urlParts = archive.file_url.split(`${bucket}/`);
                if (urlParts.length !== 2) {
                    throw new Error('Invalid file_url format');
                }
                
                const oldKey = urlParts[1];  // e.g., "undefined/1234567890_archive.zip"
                const fileName = oldKey.split('/')[1];  // e.g., "1234567890_archive.zip"
                
                if (!fileName) {
                    throw new Error('Could not extract filename from key');
                }

                // Build new key with correct accountId
                const newKey = `${accountId}/${fileName}`;
                
                console.log(`Migrating: ${oldKey} -> ${newKey}`);

                // Copy object to new location
                await s3Client.send(new CopyObjectCommand({
                    Bucket: bucket,
                    CopySource: `${bucket}/${oldKey}`,
                    Key: newKey,
                }));

                // Delete old object
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: bucket,
                    Key: oldKey,
                }));

                // Update Archive record with new URL
                const newFileUrl = `https://${Deno.env.get('DREAMHOST_ENDPOINT')}/${bucket}/${newKey}`;
                
                await base44.asServiceRole.entities.Archive.update(archive.id, {
                    file_url: newFileUrl,
                    account_id: accountId
                });

                migrated.push({
                    archiveId: archive.id,
                    oldUrl: archive.file_url,
                    newUrl: newFileUrl,
                    fileName: fileName
                });

                console.log(`✅ Migrated archive ${archive.id}`);

            } catch (error) {
                console.error(`❌ Failed to migrate archive ${archive.id}:`, error.message);
                errors.push({
                    archiveId: archive.id,
                    error: error.message
                });
            }
        }

        return Response.json({
            success: true,
            message: `Migration complete: ${migrated.length} succeeded, ${errors.length} failed`,
            migrated,
            errors
        });

    } catch (error) {
        console.error('Migration error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});