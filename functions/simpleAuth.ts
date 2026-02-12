import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { password, action, sessionToken } = await req.json();
        
        // Validate session
        if (action === "validate") {
            // Session token is valid if it exists (it's the password hash)
            return Response.json({ 
                valid: !!sessionToken && sessionToken.length > 0
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