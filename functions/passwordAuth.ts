import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { password } = await req.json();
        
        if (!password || password.length < 6) {
            return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        // Hash password to create unique identifier
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        const base44 = createClientFromRequest(req);
        
        // Check if user account exists for this password
        const existingUsers = await base44.asServiceRole.entities.User.filter({ 
            email: `user_${passwordHash}@archive.local` 
        });
        
        if (existingUsers.length === 0) {
            // Create new account
            await base44.asServiceRole.entities.User.create({
                email: `user_${passwordHash}@archive.local`,
                full_name: `User ${passwordHash.substring(0, 8)}`,
                role: 'user'
            });
        }
        
        // Return the password hash as auth token
        return Response.json({ 
            success: true,
            authToken: passwordHash
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});