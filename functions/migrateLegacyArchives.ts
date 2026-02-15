import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { S3Client, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from 'npm:@aws-sdk/client-s3@3.700.0';

// Helper to derive accountId from sessionToken
async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Validate session token
        const sessionToken = req.headers.get('Authorization')?.replace('Bearer ', '');
        if (!sessionToken) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const validateResponse = await base44.functions.invoke('passwordlessAuth', {
            action: 'validate',
            sessionToken
        });
        
        if (!validateResponse.data?.valid || !validateResponse.data?.accountId) {
            return Response.json({ error: 'Invalid session' }, { status: 401 });
        }

        const accountId = validateResponse.data.accountId;
        
        console.log('Migration: Derived accountId:', accountId.substring(0, 10) + '...');

        // Find archives for this user that need migration
        const userArchives = await base44.entities.Archive.list();
        
        // Legacy patterns to detect:
        // 1. account_id is the raw sessionToken (not a 64-char hex hash)
        // 2. file_url contains "/undefined/"
        // 3. account_id doesn't match /^[a-f0-9]{64}$/
        
        const legacyArchives = userArchives.filter(archive => {
            const hasUndefinedPath = archive.file_url && archive.file_url.includes('/undefined/');
            const accountIdIsRawToken = archive.account_id === sessionToken;
            const accountIdNotHex = archive.account_id && !/^[a-f0-9]{64}$/.test(archive.account_id);
            
            return hasUndefinedPath || accountIdIsRawToken || accountIdNotHex;
        });

        if (legacyArchives.length === 0) {
            return Response.json({ 
                success: true,
                message: 'No legacy archives found for this account',
                migrated: [],
                skipped: []
            });
        }

        console.log(`Found ${legacyArchives.length} legacy archives to migrate`);

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
        const skipped = [];
        const errors = [];

        for (const archive of legacyArchives) {
            try {
                let needsS3Migration = false;
                let oldKey = null;
                let newKey = null;

                // Check if S3 object needs migration
                if (archive.file_url) {
                    const urlParts = archive.file_url.split(`${bucket}/`);
                    if (urlParts.length === 2) {
                        oldKey = urlParts[1];
                        
                        // Check if key starts with undefined/ or wrong folder
                        if (oldKey.startsWith('undefined/') || !oldKey.startsWith(accountId + '/')) {
                            needsS3Migration = true;
                            
                            // Extract just the filename part
                            const keyParts = oldKey.split('/');
                            const fileName = keyParts[keyParts.length - 1];
                            
                            if (!fileName) {
                                throw new Error('Could not extract filename from S3 key');
                            }

                            newKey = `${accountId}/${fileName}`;
                        }
                    }
                }

                // Perform S3 migration if needed
                if (needsS3Migration && oldKey && newKey) {
                    console.log(`Migrating S3: ${oldKey} -> ${newKey}`);
                    
                    // Check if source object exists
                    try {
                        await s3Client.send(new HeadObjectCommand({
                            Bucket: bucket,
                            Key: oldKey,
                        }));
                    } catch (e) {
                        console.log(`Source object not found: ${oldKey}, skipping S3 migration`);
                        skipped.push({
                            archiveId: archive.id,
                            reason: 'Source S3 object not found',
                            oldKey
                        });
                        
                        // Still update DB record even if S3 object missing
                        await base44.entities.Archive.update(archive.id, {
                            account_id: accountId
                        });
                        
                        continue;
                    }

                    // Copy to new location
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

                    // Update Archive record
                    const newFileUrl = `https://${Deno.env.get('DREAMHOST_ENDPOINT')}/${bucket}/${newKey}`;
                    
                    await base44.entities.Archive.update(archive.id, {
                        file_url: newFileUrl,
                        account_id: accountId
                    });

                    migrated.push({
                        archiveId: archive.id,
                        oldUrl: archive.file_url,
                        newUrl: newFileUrl,
                        oldKey,
                        newKey
                    });

                    console.log(`✅ Migrated archive ${archive.id}`);
                    
                } else {
                    // Just update DB record (no S3 migration needed)
                    await base44.entities.Archive.update(archive.id, {
                        account_id: accountId
                    });

                    migrated.push({
                        archiveId: archive.id,
                        dbOnly: true,
                        message: 'Updated account_id in database only'
                    });
                    
                    console.log(`✅ Updated DB for archive ${archive.id}`);
                }

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
            message: `Migration complete: ${migrated.length} migrated, ${skipped.length} skipped, ${errors.length} failed`,
            accountId: accountId.substring(0, 10) + '...',
            migrated,
            skipped,
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