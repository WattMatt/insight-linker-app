import { Building2, Calendar, Home, LogOut } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  useSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useClientInfo } from "@/hooks/useUserRole";

const menuItems = [
  { title: "Dashboard", url: "/client-portal", icon: Home },
  { title: "Sites", url: "/client-portal/sites", icon: Building2 },
  { title: "Calendar", url: "/client-portal/calendar", icon: Calendar },
];

function ClientSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";
  const { data: clientInfo } = useClientInfo();

  const { data: currentUser } = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, email")
        .eq("id", user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  const client = clientInfo?.clients;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border p-4 min-h-[4rem]">
        <div className="flex items-center gap-3">
          {client?.logo_url ? (
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0">
              <img 
                src={client.logo_url} 
                alt="Company Logo"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
              <Building2 className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
          )}
          {!collapsed && (
            <span className="text-sm md:text-base font-semibold text-sidebar-foreground">
              {client?.company_name || client?.name || "Client Portal"}
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-2 text-xs md:text-sm">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="h-12 md:h-10">
                    <NavLink
                      to={item.url}
                      end={item.url === "/client-portal"}
                      className={({ isActive }) =>
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/50"
                      }
                    >
                      <item.icon className="h-5 w-5 md:h-4 md:w-4" />
                      {!collapsed && <span className="text-base md:text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 md:p-4">
        <div className="space-y-2">
          {currentUser && (
            <div className={`flex items-center gap-3 p-2 md:p-3 rounded-lg bg-sidebar-accent/50 ${collapsed ? 'justify-center' : ''}`}>
              <Avatar className="h-9 w-9 md:h-8 md:w-8 flex-shrink-0">
                <AvatarImage src={currentUser.avatar_url || undefined} alt={currentUser.full_name || "User"} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getInitials(currentUser.full_name)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm md:text-sm font-medium text-sidebar-foreground truncate">
                    {currentUser.full_name || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {currentUser.email}
                  </p>
                </div>
              )}
            </div>
          )}
          
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} className="h-12 md:h-10">
                <LogOut className="h-5 w-5 md:h-4 md:w-4" />
                {!collapsed && <span className="text-base md:text-sm">Logout</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export const ClientPortalLayout = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider defaultOpen={false}>
    <div className="flex min-h-screen w-full">
      <ClientSidebar />
      <main className="flex-1 flex flex-col w-full">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <SidebarTrigger className="h-10 w-10" />
          <h1 className="text-lg font-semibold md:text-xl">Client Portal</h1>
        </header>
        <div className="flex-1 p-3 md:p-4 lg:p-6 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  </SidebarProvider>
);
