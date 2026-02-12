import { S3Client, PutBucketCorsCommand } from 'npm:@aws-sdk/client-s3@3.525.0';

Deno.serve(async (req) => {
  try {
    const endpoint = Deno.env.get('DREAMHOST_ENDPOINT');
    const endpointUrl = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
    
    const s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: endpointUrl,
      credentials: {
        accessKeyId: Deno.env.get('DREAMHOST_ACCESS_KEY'),
        secretAccessKey: Deno.env.get('DREAMHOST_SECRET_KEY'),
      },
      forcePathStyle: true,
    });

    const corsConfiguration = {
      CORSRules: [
        {
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST'],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 3000,
        },
      ],
    };

    const command = new PutBucketCorsCommand({
      Bucket: Deno.env.get('DREAMHOST_BUCKET'),
      CORSConfiguration: corsConfiguration,
    });

    await s3Client.send(command);

    return Response.json({ 
      success: true, 
      message: 'CORS policy successfully configured for DreamHost bucket' 
    });
  } catch (error) {
    console.error('CORS setup error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});