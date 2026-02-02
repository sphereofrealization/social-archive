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
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <SidebarProvider>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Charcoal&display=swap');
        
        :root {
          --mac-platinum: #dddddd;
          --mac-dark: #777777;
          --mac-light: #ffffff;
          --mac-accent: #0066cc;
          --mac-shadow: rgba(0,0,0,0.3);
        }
        
        * {
          font-family: -apple-system, 'Lucida Grande', 'Geneva', 'Helvetica', sans-serif;
        }
        
        body {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
        }
        
        .mac-window {
          background: var(--mac-platinum);
          border: 1px solid #999;
          border-radius: 8px;
          box-shadow: 0 4px 16px var(--mac-shadow);
          overflow: hidden;
        }
        
        .mac-titlebar {
          background: linear-gradient(180deg, 
            #f0f0f0 0%, 
            #e0e0e0 3%, 
            #d8d8d8 3%, 
            #d0d0d0 6%,
            #c8c8c8 6%,
            #c0c0c0 9%,
            #b8b8b8 9%,
            #b0b0b0 12%,
            #a8a8a8 12%,
            #a0a0a0 100%
          );
          padding: 4px 8px;
          border-bottom: 1px solid #888;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: bold;
          color: #333;
        }
        
        .mac-titlebar-active {
          background: linear-gradient(180deg,
            #e8e8ff 0%,
            #d0d0ff 3%,
            #c8c8f8 3%,
            #b8b8f0 6%,
            #a8a8e8 6%,
            #9898e0 9%,
            #8888d8 9%,
            #7878d0 12%,
            #6868c8 12%,
            #5858c0 100%
          );
          color: #000;
        }
        
        .mac-button {
          background: linear-gradient(180deg, #fdfdfd 0%, #e8e8e8 50%, #d0d0d0 100%);
          border: 1px solid #888;
          border-radius: 4px;
          padding: 6px 20px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: all 0.1s;
        }
        
        .mac-button:hover {
          background: linear-gradient(180deg, #ffffff 0%, #f0f0f0 50%, #e0e0e0 100%);
          border-color: #666;
        }
        
        .mac-button:active {
          background: linear-gradient(180deg, #c0c0c0 0%, #d8d8d8 50%, #e8e8e8 100%);
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);
        }
        
        .mac-button-active {
          background: linear-gradient(180deg, #4a90e2 0%, #357abd 50%, #2868ab 100%);
          border-color: #1a5490;
          color: white;
          box-shadow: inset 0 1px 2px rgba(255,255,255,0.3);
        }
        
        .mac-panel {
          background: var(--mac-platinum);
          border: 1px solid #999;
          border-radius: 4px;
          padding: 12px;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
        }
        
        .mac-sidebar {
          background: linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%);
          border-right: 1px solid #aaa;
        }
        
        .mac-dots {
          display: flex;
          gap: 4px;
        }

        .mac-dot {
          width: 18px;
          height: 18px;
          border-radius: 0;
          border: 1px solid #1a1a1a;
          background: linear-gradient(180deg, #3a3a3a 0%, #1a1a1a 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: bold;
          color: #606060;
          font-family: monospace;
          cursor: pointer;
          transition: all 0.1s;
        }

        .mac-dot:hover {
          background: linear-gradient(180deg, #4a4a4a 0%, #2a2a2a 100%);
          color: #808080;
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
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