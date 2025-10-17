import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Lock, User } from "lucide-react";
import { Session } from "@supabase/supabase-js";

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [settings, setSettings] = useState<{
    company_name: string;
    company_logo_url: string | null;
    login_hero_image_url: string | null;
  } | null>(null);

  useEffect(() => {
    // Check if this is an invite flow
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type');
    
    // Check for access token in URL (from invite email)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    
    if (type === 'invite' && accessToken) {
      // Handle invite flow
      handleInviteToken(accessToken);
      return;
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        // Check if user needs to change password
        const needsChange = session?.user?.user_metadata?.requires_password_change;
        setRequiresPasswordChange(needsChange || false);
        
        if (session && !isInvite && !needsChange) {
          // Redirect based on user role
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
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      const needsChange = session?.user?.user_metadata?.requires_password_change;
      setRequiresPasswordChange(needsChange || false);
      
      if (session && !isInvite && !needsChange) {
        // Redirect based on user role
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
      }
    });

    // Fetch settings
    fetchSettings();

    return () => subscription.unsubscribe();
  }, [navigate, isInvite]);

  const handleInviteToken = async (token: string) => {
    try {
      setLoading(true);
      
      // Set the session with the invite token
      const { data, error } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: token,
      });

      if (error) {
        console.error("Session error:", error);
        throw new Error("Invalid or expired invite link");
      }

      if (data.session && data.user) {
        setSession(data.session);
        setIsInvite(true);
        setInviteEmail(data.user.email || "");
        toast.success("Welcome! Please create your password below.");
      } else {
        throw new Error("No session data received");
      }
    } catch (error: any) {
      console.error("Error handling invite token:", error);
      toast.error(
        error.message || "Invalid or expired invite link. Please contact your administrator for a new invitation.",
        { duration: 6000 }
      );
      // Clear URL params and redirect
      window.history.replaceState({}, document.title, "/auth");
      setIsInvite(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from("settings")
        .select("company_name, company_logo_url, login_hero_image_url")
        .single();
      
      if (data) setSettings(data);
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Invalid email or password");
        } else {
          toast.error(error.message);
        }
      } else if (data.session) {
        // Check if user needs to change password
        const needsChange = data.user?.user_metadata?.requires_password_change;
        if (needsChange) {
          setRequiresPasswordChange(true);
          setSession(data.session);
          toast.success("Welcome! Please change your password to continue.");
        } else {
          toast.success("Signed in successfully!");
          navigate("/dashboard");
        }
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const fullName = formData.get("fullName") as string;

    // Basic validation
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error("This email is already registered. Please sign in instead.");
        } else {
          toast.error(error.message);
        }
      } else if (data.user) {
        toast.success("Account created! Check your email to confirm.");
        setIsSignUp(false);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = prompt("Enter your email address:");
    if (!email) return;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password reset email sent! Check your inbox.");
      }
    } catch (error) {
      toast.error("Failed to send reset email");
    }
  };

  const handleSetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // Validation
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      setLoading(false);
      return;
    }

    // Password strength check
    const hasNumber = /\d/.test(password);
    const hasLetter = /[a-zA-Z]/.test(password);
    
    if (!hasNumber || !hasLetter) {
      toast.error("Password must contain both letters and numbers");
      setLoading(false);
      return;
    }

    try {
      // Verify we still have a valid session
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Session expired. Please request a new invite link.");
      }

      // Update the user's password
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error("Password update error:", error);
        throw error;
      }

      if (!data.user) {
        throw new Error("Failed to update password");
      }

      // Clear the requires_password_change flag
      await supabase.auth.updateUser({
        data: {
          requires_password_change: false,
        }
      });

      toast.success("Password updated successfully! Welcome aboard!");
      
      // Small delay then navigate
      setTimeout(() => {
        setRequiresPasswordChange(false);
        navigate("/dashboard");
      }, 1000);
    } catch (error: any) {
      console.error("Error setting password:", error);
      
      if (error.message?.includes("expired") || error.message?.includes("Session")) {
        toast.error(
          "Your invite link has expired. Please contact your administrator for a new invitation.",
          { duration: 6000 }
        );
        setIsInvite(false);
        window.history.replaceState({}, document.title, "/auth");
      } else {
        toast.error(error.message || "Failed to set password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="flex justify-center">
            {settings?.company_logo_url ? (
              <img 
                src={settings.company_logo_url} 
                alt={settings.company_name || "Company Logo"}
                className="h-16 object-contain"
              />
            ) : (
              <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-foreground">WM</span>
              </div>
            )}
          </div>

          {/* Heading */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {settings?.company_name || "Watson Mattheus"}
            </h1>
            <p className="text-muted-foreground">
              {isInvite
                ? "Welcome! Create your password to complete setup"
                : isSignUp 
                  ? "Create your account to get started" 
                  : "Enter your email below to login to your account"
              }
            </p>
          </div>

          {/* Form */}
          {isInvite || requiresPasswordChange ? (
            // Password Setup Form for Invited Users or Password Change Required
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="rounded-lg bg-muted p-4 mb-4">
                <p className="text-sm text-muted-foreground">
                  {requiresPasswordChange 
                    ? "Please change your temporary password to continue"
                    : `Setting up password for: ${inviteEmail || session?.user?.email}`}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-password">{requiresPasswordChange ? "New Password" : "Create Password"}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="invite-password"
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    className="pl-10"
                    autoComplete="new-password"
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters and contain both letters and numbers
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="invite-confirm-password"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                    className="pl-10"
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-sky-500 hover:bg-sky-600 text-white" 
                disabled={loading}
                size="lg"
              >
                {loading ? "Setting password..." : "Set Password & Continue"}
              </Button>
            </form>
          ) : !isSignUp ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="admin@wmeng.co.za"
                    required
                    className="pl-10"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot your password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="pl-10"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-sky-500 hover:bg-sky-600 text-white" 
                disabled={loading}
                size="lg"
              >
                {loading ? "Signing in..." : "Login"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-name"
                    name="fullName"
                    type="text"
                    placeholder="John Smith"
                    required
                    className="pl-10"
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="admin@wmeng.co.za"
                    required
                    className="pl-10"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    className="pl-10"
                    autoComplete="new-password"
                    placeholder="Minimum 6 characters"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-sky-500 hover:bg-sky-600 text-white" 
                disabled={loading}
                size="lg"
              >
                {loading ? "Creating account..." : "Sign up"}
              </Button>
            </form>
          )}

          {/* Toggle Sign In/Sign Up - Hide when in invite mode */}
          {!isInvite && (
            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                {isSignUp ? "Already have an account? " : "Don't have an account? "}
              </span>
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary hover:underline font-medium"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Hero Image */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-background">
        {settings?.login_hero_image_url ? (
          <img
            src={settings.login_hero_image_url}
            alt="Login Hero"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-sky-600/20 via-blue-700/20 to-indigo-800/20 flex items-center justify-center">
            <div className="text-center text-white/80 p-8">
              <h2 className="text-4xl font-bold mb-4">Electrical Compliance Management</h2>
              <p className="text-lg">Streamline your inspections and certifications</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;
