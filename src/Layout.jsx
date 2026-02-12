import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, BookOpen, Archive, CheckSquare, LogOut, Download } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: Home,
  },
  {
    title: "Platform Guides",
    url: createPageUrl("Guides"),
    icon: BookOpen,
  },
  {
    title: "My Archives",
    url: createPageUrl("Archives"),
    icon: Archive,
  },
  {
    title: "Deletion Checklist",
    url: createPageUrl("Checklist"),
    icon: CheckSquare,
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    // Skip auth check on login page
    if (currentPageName === "PasswordLogin") {
      return;
    }

    let mounted = true;

    const checkAuth = async () => {
      const authToken = localStorage.getItem('auth_token');
      console.log('Checking auth, token exists:', !!authToken);
      
      if (!authToken) {
        if (mounted) window.location.replace(createPageUrl("PasswordLogin"));
        return;
      }

      try {
        const response = await base44.functions.invoke('validateAuth', { authToken });
        console.log('Validation response:', response);
        if (!mounted) return;
        
        if (response.data?.valid && response.data?.user) {
          console.log('User validated:', response.data.user);
          setUser(response.data.user);
        } else {
          console.log('Invalid user, clearing token');
          localStorage.removeItem('auth_token');
          window.location.replace(createPageUrl("PasswordLogin"));
        }
      } catch (err) {
        console.error('Auth validation error:', err);
        if (!mounted) return;
        localStorage.removeItem('auth_token');
        window.location.replace(createPageUrl("PasswordLogin"));
      }
    };
    
    checkAuth();
    
    return () => { mounted = false; };
  }, [currentPageName]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    window.location.replace(createPageUrl("PasswordLogin"));
  };

  // Show login page without layout
  if (currentPageName === "PasswordLogin") {
    return children;
  }

  // Show loading while checking auth
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');

        :root {
          --klingon-black: #0a0a0a;
          --klingon-steel: #1a1a1a;
          --klingon-metal: #2a2a2a;
          --klingon-red: #8b0000;
          --klingon-amber: #ff6600;
          --klingon-glow: rgba(139, 0, 0, 0.5);
        }

        * {
          font-family: 'Orbitron', monospace, sans-serif;
        }

        body {
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #2a2a2a 100%);
        }

        .mac-window {
          background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
          border: 2px solid #000;
          border-radius: 0;
          box-shadow: 0 0 20px rgba(139, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          overflow: hidden;
        }

        .mac-titlebar {
          background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%);
          padding: 8px 12px;
          border-bottom: 2px solid #8b0000;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 900;
          color: #ff6600;
          text-transform: uppercase;
          letter-spacing: 2px;
          box-shadow: 0 2px 0 rgba(139, 0, 0, 0.5);
        }

        .mac-titlebar-active {
          background: linear-gradient(180deg, #3a0000 0%, #1a0000 100%);
          color: #ff3300;
          text-shadow: 0 0 10px rgba(255, 51, 0, 0.8);
        }

        .mac-button {
          background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%);
          border: 1px solid #000;
          border-radius: 0;
          padding: 8px 24px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 0 rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05);
          transition: all 0.1s;
          color: #ff6600;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .mac-button:hover {
          background: linear-gradient(180deg, #3a3a3a 0%, #2a2a2a 100%);
          box-shadow: 0 0 10px rgba(255, 102, 0, 0.5);
          color: #ff8800;
        }

        .mac-button:active {
          background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);
        }

        .mac-button-active {
          background: linear-gradient(180deg, #8b0000 0%, #5a0000 100%);
          border-color: #ff0000;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(139, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .mac-panel {
          background: linear-gradient(180deg, #1f1f1f 0%, #0f0f0f 100%);
          border: 1px solid #000;
          border-radius: 0;
          padding: 12px;
          box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
        }

        .mac-sidebar {
          background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
          border-right: 2px solid #8b0000;
        }

        .mac-dots {
          display: flex;
          gap: 4px;
        }

        .mac-dot {
          width: 18px;
          height: 18px;
          border-radius: 0;
          border: 1px solid #000;
          background: linear-gradient(180deg, #3a3a3a 0%, #1a1a1a 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 5px rgba(139, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          color: #666;
          font-family: monospace;
          cursor: pointer;
          transition: all 0.1s;
        }

        .mac-dot:hover {
          background: linear-gradient(180deg, #4a0000 0%, #2a0000 100%);
          color: #ff3300;
          box-shadow: 0 0 10px rgba(255, 51, 0, 0.8);
        }

        .mac-dot-close::before {
          content: '×';
          font-size: 14px;
        }

        .mac-dot-minimize::before {
          content: '−';
        }

        .mac-dot-maximize::before {
          content: '⇔';
          font-size: 11px;
        }

        .gradient-bg {
          background: linear-gradient(135deg, #0a0a0a 0%, #1a0000 50%, #0a0a0a 100%);
        }
      `}</style>
      <div className="min-h-screen flex w-full gradient-bg">
        <Sidebar className="mac-sidebar">
          <SidebarHeader className="p-4">
            <div className="mac-window">
              <div className="mac-titlebar mac-titlebar-active">
                <div className="mac-dots">
                  <div className="mac-dot mac-dot-close" title="Close"></div>
                  <div className="mac-dot mac-dot-minimize" title="Minimize"></div>
                  <div className="mac-dot mac-dot-maximize" title="Maximize"></div>
                </div>
              </div>
              <div className="p-6 text-center bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="w-16 h-16 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Download className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Social Archive</h2>
                <p className="text-sm text-gray-600">Backup & Delete Tool</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-bold text-gray-600 uppercase px-2 mb-3">
                Navigation
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={`mb-2 ${
                          location.pathname === item.url ? 'mac-button-active' : 'mac-button'
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4 border-t border-gray-300">
            {user && (
              <div className="space-y-3">
                <div className="mac-panel">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 rounded-full shadow-md border-2 border-white">
                      <span className="text-white font-bold text-lg">
                        {user.full_name?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 truncate text-sm">{user.full_name}</p>
                      <p className="text-xs text-gray-600 truncate">{user.email}</p>
                    </div>
                  </div>
                </div>
                <button 
                  className="mac-button w-full flex items-center justify-center gap-2 text-sm"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="mac-sidebar px-6 py-3 md:hidden sticky top-0 z-10 border-b border-gray-300">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="mac-button" />
              <h1 className="text-lg font-bold text-gray-800">Social Archive</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-6">
            <div className="mac-window min-h-full">
              <div className="mac-titlebar mac-titlebar-active">
                <div className="mac-dots">
                  <div className="mac-dot mac-dot-close"></div>
                  <div className="mac-dot mac-dot-minimize"></div>
                  <div className="mac-dot mac-dot-maximize"></div>
                </div>
                <span className="flex-1 text-center">{currentPageName || "Social Archive System"}</span>
              </div>
              <div className="p-8 bg-white">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}