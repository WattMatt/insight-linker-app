import { Home, MapPin, LogOut, User, Briefcase } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const menuItems = [
  { title: "Dashboard", url: "/contractor", icon: Home },
  { title: "My Sites", url: "/contractor/sites", icon: MapPin },
];

const ContractorSidebar = () => {
  const navigate = useNavigate();
  const { open } = useSidebar();

  const { data: currentUser } = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      return profile;
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Briefcase className="h-6 w-6 text-primary" />
          {open && (
            <div>
              <h2 className="font-semibold text-sm">Contractor Portal</h2>
              <p className="text-xs text-muted-foreground">Site Access</p>
            </div>
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
                      end
                      className={({ isActive }) =>
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted"
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={currentUser?.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {currentUser?.full_name ? getInitials(currentUser.full_name) : <User className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          {open && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {currentUser?.full_name || "Contractor"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentUser?.email || ""}
              </p>
            </div>
          )}
        </div>
        {open && (
          <>
            <Separator className="my-2" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};

const ContractorPortalLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ContractorSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">Contractor Portal</h1>
          </header>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default ContractorPortalLayout;
