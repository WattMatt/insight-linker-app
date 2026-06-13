import { useEffect } from "react";
import { useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      // getSession reads localStorage (offline-safe). The role query below is network —
      // wrap so a failure (e.g. offline) routes to a sensible default instead of leaving
      // the user stranded on the spinner forever.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      try {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (roleData?.role === "Client") {
          navigate("/client-portal");
        } else if (roleData?.role === "Contractor") {
          navigate("/contractor");
        } else {
          navigate("/dashboard");
        }
      } catch (err) {
        // Authenticated but role lookup failed (offline / network). Send them into the
        // app rather than stranding the spinner; the destination guard re-checks the role.
        console.error("Role lookup failed on entry:", err);
        navigate("/dashboard");
      }
    };
    checkAuth().catch((err) => {
      console.error("Auth check failed on entry:", err);
      navigate("/auth");
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  );
};

export default Index;
