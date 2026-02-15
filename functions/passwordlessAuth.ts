import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to derive stable accountId from sessionToken
async function sha256Hex(input) {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
    try {
        const { password, action, sessionToken } = await req.json();
        
        // Validate session
        if (action === "validate") {
            if (!sessionToken || sessionToken.length < 10) {
                return Response.json({ 
                    valid: false,
                    error: 'Invalid session token'
                }, { status: 401 });
            }
            
            // Derive accountId from sessionToken (deterministic, safe for S3 keys)
            const accountId = await sha256Hex(sessionToken);
            
            return Response.json({ 
                valid: true,
                accountId: accountId,
                userId: accountId  // Backward compatibility alias
            });
        }
        
        // Login - any password is valid, hash it to create session token
        if (!password || password.length === 0) {
            return Response.json({ 
                success: false,
                error: "Password required" 
            }, { status: 400 });
        }
        
        // Hash password to create session token
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return Response.json({ 
            success: true,
            sessionToken: passwordHash
        });
        
    } catch (error) {
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});