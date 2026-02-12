import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const { authToken } = await req.json();
        
        if (!authToken) {
            return Response.json({ valid: false }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        
        // Check if user exists with this token
        const users = await base44.asServiceRole.entities.User.filter({ 
            email: `user_${authToken}@archive.local` 
        });
        
        if (users.length > 0) {
            return Response.json({ 
                valid: true,
                user: users[0]
            });
        }
        
        return Response.json({ valid: false }, { status: 401 });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});