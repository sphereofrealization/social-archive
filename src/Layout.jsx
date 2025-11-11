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
        @import url('https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap');
        
        :root {
          --win98-blue: #0000aa;
          --win98-title: #1084d0;
          --win98-gray: #c0c0c0;
          --win98-light: #dfdfdf;
          --win98-dark: #808080;
          --win98-teal: #008080;
          --win98-purple: #a000a0;
        }
        
        * {
          font-family: 'Comic Neue', 'Trebuchet MS', sans-serif;
        }
        
        body {
          background: var(--win98-teal);
        }
        
        .win98-window {
          background: var(--win98-gray);
          border-top: 2px solid #ffffff;
          border-left: 2px solid #ffffff;
          border-right: 2px solid #000000;
          border-bottom: 2px solid #000000;
          box-shadow: 2px 2px 5px rgba(0,0,0,0.3);
        }
        
        .win98-titlebar {
          background: linear-gradient(90deg, #0000aa 0%, #1084d0 100%);
          color: white;
          padding: 3px 6px;
          font-weight: bold;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .win98-button {
          background: var(--win98-gray);
          border-top: 2px solid #ffffff;
          border-left: 2px solid #ffffff;
          border-right: 2px solid #000000;
          border-bottom: 2px solid #000000;
          padding: 6px 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.1s;
        }
        
        .win98-button:hover {
          background: var(--win98-light);
        }
        
        .win98-button:active {
          border-top: 2px solid #000000;
          border-left: 2px solid #000000;
          border-right: 2px solid #ffffff;
          border-bottom: 2px solid #ffffff;
        }
        
        .win98-button-pressed {
          background: var(--win98-dark);
          border-top: 2px solid #000000;
          border-left: 2px solid #000000;
          border-right: 2px solid #ffffff;
          border-bottom: 2px solid #ffffff;
          color: white;
        }
        
        .win98-panel {
          background: var(--win98-gray);
          border-top: 2px solid #808080;
          border-left: 2px solid #808080;
          border-right: 2px solid #ffffff;
          border-bottom: 2px solid #ffffff;
          padding: 12px;
        }
        
        .win98-sidebar {
          background: var(--win98-gray);
          border-right: 2px solid #808080;
        }
        
        .gradient-bg {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
        }
        
        .win98-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #ff6b9d 0%, #c06c84 100%);
          border: 2px solid #fff;
          box-shadow: 2px 2px 0 rgba(0,0,0,0.3);
        }
      `}</style>
      <div className="min-h-screen flex w-full gradient-bg">
        <Sidebar className="win98-sidebar">
          <SidebarHeader className="p-3">
            <div className="win98-window">
              <div className="win98-titlebar">
                <div className="win98-icon">
                  <Download className="w-5 h-5 text-white" />
                </div>
                <span>Social Archive v1.0</span>
              </div>
              <div className="p-4 text-center">
                <h2 className="text-2xl font-bold text-[#0000aa] mb-1">Social Archive</h2>
                <p className="text-sm font-bold text-[#a000a0]">Backup & Delete Tool</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-3">
            <SidebarGroup>
              <SidebarGroupLabel className="text-base font-bold text-[#0000aa] uppercase px-2 py-2 mb-2">
                Navigation Menu
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={`mb-2 ${
                          location.pathname === item.url ? 'win98-button-pressed' : 'win98-button'
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-3 py-2">
                          <item.icon className="w-5 h-5" />
                          <span className="font-bold">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t-2 border-[#808080]">
            {user && (
              <div className="space-y-3">
                <div className="win98-panel">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-[#ff6b9d] to-[#c06c84] border-2 border-white rounded-full shadow-lg">
                      <span className="text-white font-bold text-xl">
                        {user.full_name?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#0000aa] truncate">{user.full_name}</p>
                      <p className="text-xs text-[#808080] truncate">{user.email}</p>
                    </div>
                  </div>
                </div>
                <button 
                  className="win98-button w-full flex items-center justify-center gap-2"
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
          <header className="win98-sidebar px-6 py-3 md:hidden sticky top-0 z-10 border-b-2 border-[#808080]">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="win98-button" />
              <h1 className="text-xl font-bold text-[#0000aa]">Social Archive</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-4">
            <div className="win98-window min-h-full">
              <div className="win98-titlebar">
                <div className="w-4 h-4 bg-white"></div>
                <span>{currentPageName || "Social Archive System"}</span>
                <div className="ml-auto flex gap-1">
                  <div className="w-5 h-5 bg-[#c0c0c0] border border-black flex items-center justify-center text-xs">_</div>
                  <div className="w-5 h-5 bg-[#c0c0c0] border border-black flex items-center justify-center text-xs">□</div>
                  <div className="w-5 h-5 bg-[#c0c0c0] border border-black flex items-center justify-center text-xs">×</div>
                </div>
              </div>
              <div className="p-6 bg-white">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}