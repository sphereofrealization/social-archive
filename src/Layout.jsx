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
        @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
        
        :root {
          --mac-beige: #ede6d6;
          --mac-dark: #2b2b2b;
          --mac-border: #000000;
          --mac-shadow: rgba(0, 0, 0, 0.3);
          --mac-highlight: #ffffff;
        }
        
        body {
          font-family: 'VT323', monospace;
          background: var(--mac-beige);
        }
        
        .mac-window {
          background: var(--mac-beige);
          border: 3px solid var(--mac-border);
          box-shadow: 
            inset 2px 2px 0 var(--mac-highlight),
            inset -2px -2px 0 var(--mac-dark),
            4px 4px 0 var(--mac-shadow);
        }
        
        .mac-button {
          background: var(--mac-beige);
          border: 2px solid var(--mac-border);
          box-shadow: 
            inset 1px 1px 0 var(--mac-highlight),
            inset -1px -1px 0 var(--mac-dark);
          font-family: 'VT323', monospace;
          font-size: 18px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .mac-button:hover {
          background: #d4cdb8;
        }
        
        .mac-button:active {
          box-shadow: 
            inset -1px -1px 0 var(--mac-highlight),
            inset 1px 1px 0 var(--mac-dark);
        }
        
        .mac-title-bar {
          background: repeating-linear-gradient(
            90deg,
            #000 0px,
            #000 2px,
            #fff 2px,
            #fff 4px
          );
          height: 24px;
        }
        
        .mac-menu-item {
          border: 2px solid transparent;
          font-family: 'VT323', monospace;
          font-size: 20px;
          letter-spacing: 1px;
        }
        
        .mac-menu-item:hover {
          background: var(--mac-dark);
          color: var(--mac-beige);
          border: 2px solid var(--mac-border);
        }
        
        .mac-menu-item.active {
          background: var(--mac-dark);
          color: var(--mac-beige);
          border: 2px solid var(--mac-border);
        }
        
        .mac-pixel-border {
          border: 3px solid var(--mac-border);
          background: var(--mac-beige);
          image-rendering: pixelated;
        }
        
        * {
          letter-spacing: 0.5px;
        }
        
        h1, h2, h3, h4, h5, h6 {
          font-family: 'VT323', monospace;
          font-weight: normal;
          letter-spacing: 2px;
        }
      `}</style>
      <div className="min-h-screen flex w-full bg-[#ede6d6]">
        <Sidebar className="border-r-4 border-black bg-[#ede6d6]">
          <SidebarHeader className="border-b-4 border-black p-4 bg-[#ede6d6]">
            <div className="mac-window p-3">
              <div className="mac-title-bar mb-2"></div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 border-4 border-black bg-white flex items-center justify-center">
                  <Download className="w-8 h-8 text-black" style={{ strokeWidth: 3 }} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-black uppercase">Social Archive</h2>
                  <p className="text-sm text-black uppercase tracking-wider">v1.0</p>
                </div>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-3 bg-[#ede6d6]">
            <SidebarGroup>
              <SidebarGroupLabel className="text-lg font-bold text-black uppercase tracking-wider px-2 py-3 border-b-2 border-black mb-2">
                :: Navigation ::
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={`mac-menu-item mb-2 ${
                          location.pathname === item.url ? 'active' : ''
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-3 py-3">
                          <item.icon className="w-5 h-5" style={{ strokeWidth: 3 }} />
                          <span className="font-bold uppercase">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t-4 border-black p-3 bg-[#ede6d6]">
            {user && (
              <div className="space-y-3">
                <div className="mac-window p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border-3 border-black bg-white flex items-center justify-center">
                      <span className="text-black font-bold text-xl">
                        {user.full_name?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-black text-lg uppercase truncate">{user.full_name}</p>
                      <p className="text-sm text-black truncate">{user.email}</p>
                    </div>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mac-button"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  LOGOUT
                </Button>
              </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col bg-[#ede6d6]">
          <header className="bg-[#ede6d6] border-b-4 border-black px-6 py-4 md:hidden sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="mac-button p-2" />
              <h1 className="text-2xl font-bold uppercase">Social Archive</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-6">
            <div className="mac-window p-6 min-h-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}