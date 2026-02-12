import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Set your password here
const SITE_PASSWORD = "archivepass2024";
const SESSION_SECRET = "archive_session_active";

Deno.serve(async (req) => {
    try {
        const { password, action } = await req.json();
        
        // Validate session
        if (action === "validate") {
            const { sessionToken } = await req.json();
            return Response.json({ 
                valid: sessionToken === SESSION_SECRET 
            });
        }
        
        // Login
        if (password === SITE_PASSWORD) {
            return Response.json({ 
                success: true,
                sessionToken: SESSION_SECRET
            });
        }
        
        return Response.json({ 
            success: false,
            error: "Incorrect password" 
        }, { status: 401 });
        
    } catch (error) {
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});