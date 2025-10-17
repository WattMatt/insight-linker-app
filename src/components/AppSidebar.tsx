import { 
  Home, 
  Users, 
  Building2, 
  ClipboardCheck, 
  LogOut,
  Zap,
  UserCog,
  CalendarDays,
  FileText,
  Settings as SettingsIcon,
  User as UserIcon,
  MessageSquarePlus,
  Eye,
  Briefcase
} from "lucide-react";
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
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Inspection Templates", url: "/inspection-templates", icon: FileText },
  { title: "Validation Feedback", url: "/validation-feedback", icon: MessageSquarePlus },
  { title: "Users", url: "/users", icon: UserCog },
  { title: "Client Portal Preview", url: "/admin-client-preview", icon: Eye },
  { title: "Contractor Portal Preview", url: "/admin-contractor-preview", icon: Briefcase },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
  
];

export function AppSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";

  // Fetch company settings for logo and name
  const { data: settings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("company_logo_url, company_name")
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch current user profile
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

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border p-4 min-h-[4rem]">
        <div className="flex items-center gap-3">
          {settings?.company_logo_url ? (
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0">
              <img 
                src={settings.company_logo_url} 
                alt="Company Logo"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
              <Zap className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
          )}
          {!collapsed && (
            <span className="text-sm md:text-base font-semibold text-sidebar-foreground">
              {settings?.company_name || "SiteWise"}
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
          {/* User Profile Section */}
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
          
          {/* Logout Button */}
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
