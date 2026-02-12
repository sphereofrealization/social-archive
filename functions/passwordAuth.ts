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
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Use hash as email identifier
        const userEmail = `user_${hashHex}@archive.local`;
        
        const base44 = createClientFromRequest(req);
        
        // Check if user exists
        const existingUsers = await base44.asServiceRole.entities.User.filter({ email: userEmail });
        
        if (existingUsers.length === 0) {
            // Create new user with this password-hash
            await base44.asServiceRole.entities.User.create({
                email: userEmail,
                full_name: `User ${hashHex.substring(0, 8)}`,
                role: 'user'
            });
        }
        
        // Generate magic link for authentication
        const magicLink = await base44.asServiceRole.auth.createMagicLink(userEmail);
        
        return Response.json({ 
            success: true,
            magicLink: magicLink
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});