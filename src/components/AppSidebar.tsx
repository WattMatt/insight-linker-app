import { 
  Home, 
  Users, 
  Building2, 
  ClipboardCheck, 
  LogOut,
  Zap,
  UserCog,
  CalendarDays,
  Database,
  CloudUpload,
  FileText,
  Settings as SettingsIcon
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
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
  { title: "Users", url: "/users", icon: UserCog },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
  { title: "Firebase Sync", url: "/firebase-sync", icon: CloudUpload },
  { title: "Data Import", url: "/data-import", icon: Database },
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          {settings?.company_logo_url ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center">
              <img 
                src={settings.company_logo_url} 
                alt="Company Logo"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Zap className="h-5 w-5 text-primary" />
            </div>
          )}
          {!collapsed && (
            <span className="font-semibold text-sidebar-foreground">
              {settings?.company_name || "SiteWise"}
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={({ isActive }) =>
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/50"
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Logout</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
