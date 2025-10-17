import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, Mail, Send, MoreVertical, Edit, Upload, X, Eye } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  status: string | null;
  role?: string;
  phone?: string | null;
  job_title?: string | null;
  department?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  full_name: string | null;
  firebase_id: string | null;
  invited_at: string | null;
  created_at: string;
}

const Users = () => {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"Admin" | "Moderator" | "User" | "Contractor" | "Client">("User");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<"Admin" | "Moderator" | "User" | "Contractor" | "Client">("User");
  const [editStatus, setEditStatus] = useState<"Active" | "Inactive">("Active");
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    phone: "",
    job_title: "",
    department: "",
    company: "",
    address: "",
    city: "",
    country: "",
    postal_code: "",
    bio: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [resendOpen, setResendOpen] = useState(false);
  const [resendUser, setResendUser] = useState<UserProfile | null>(null);
  const [resendTempPassword, setResendTempPassword] = useState("");
  const queryClient = useQueryClient();

  // Fetch pending invites
  const { data: pendingInvites, isLoading: pendingLoading } = useQuery({
    queryKey: ["pending-invites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_user_invites")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PendingInvite[];
    },
  });

  // Fetch clients for client user assignment
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch sites for contractor assignment
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all users with their roles and client mappings
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles and client mappings for each user
      const usersWithRoles = await Promise.all(
        profiles.map(async (profile) => {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id)
            .maybeSingle();

          const { data: clientMapping } = await supabase
            .from("user_clients")
            .select("client_id, clients(name, company_name)")
            .eq("user_id", profile.id)
            .maybeSingle();

          return {
            ...profile,
            role: roleData?.role || "User",
            clientInfo: clientMapping,
          };
        })
      );

      return usersWithRoles as UserProfile[];
    },
  });

  // Send invite to pending user
  const sendInviteMutation = useMutation({
    mutationFn: async (invite: PendingInvite) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: invite.email, fullName: invite.full_name || '' }
      });
      
      if (error) throw error;
      if (!data.success) {
        throw new Error(data.error || 'Failed to send invite');
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Invitation sent successfully!");
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send invitation");
    },
  });

  // Invite user mutation
  const inviteMutation = useMutation({
    mutationFn: async (userData: { email: string; fullName: string; role: string; temporaryPassword?: string; clientId?: string; siteIds?: string[] }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: userData.email,
          fullName: userData.fullName,
          role: userData.role,
          isResend: false,
          temporaryPassword: userData.temporaryPassword,
          clientId: userData.clientId,
          siteIds: userData.siteIds,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to invite user');
      
      return data;
    },
    onSuccess: (data) => {
      if (data.temporaryPassword) {
        toast.success(
          `User created! Temporary password: ${data.temporaryPassword}`,
          { duration: 10000 }
        );
      } else {
        toast.success(data.message || "Invitation sent successfully!");
      }
      setOpen(false);
      setEmail("");
      setFullName("");
      setRole("User");
      setSelectedClientId("");
      setSelectedSiteIds([]);
      setTemporaryPassword("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send invitation");
    },
  });

  // Resend invite mutation for existing users
  const resendInviteMutation = useMutation({
    mutationFn: async ({ user, temporaryPassword }: { user: UserProfile; temporaryPassword?: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: user.email,
          fullName: user.full_name || '',
          role: user.role || 'User',
          isResend: true,
          temporaryPassword,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to resend invitation');
      
      return data;
    },
    onSuccess: (data) => {
      if (data.temporaryPassword) {
        toast.success(
          `Password reset! Temporary password: ${data.temporaryPassword}`,
          { duration: 10000 }
        );
      } else {
        toast.success(data.message || "Invitation resent successfully!");
      }
      setResendOpen(false);
      setResendUser(null);
      setResendTempPassword("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to resend invitation");
    },
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      // Check if role exists
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole } as any)
          .eq("user_id", userId);
        
        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: userId, role: newRole }] as any);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("User role updated successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  // Update user status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus })
        .eq("id", userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User status updated successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  // Update user profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, profileData }: { userId: string; profileData: any }) => {
      const { error } = await supabase
        .from("profiles")
        .update(profileData)
        .eq("id", userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      setEditOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update profile");
    },
  });

  const handleEditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setEditRole(user.role as "Admin" | "Moderator" | "User" | "Contractor");
    setEditStatus((user.status || "Active") as "Active" | "Inactive");
    setEditFormData({
      full_name: user.full_name || "",
      phone: user.phone || "",
      job_title: user.job_title || "",
      department: user.department || "",
      company: user.company || "",
      address: user.address || "",
      city: user.city || "",
      country: user.country || "South Africa",
      postal_code: user.postal_code || "",
      bio: user.bio || "",
    });
    setAvatarPreview(user.avatar_url || "");
    setAvatarFile(null);
    setEditOpen(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview("");
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;

    try {
      let avatarUrl = editFormData.full_name ? selectedUser.avatar_url : null;

      // Upload avatar if a new file is selected
      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const fileName = `${selectedUser.id}/avatar.${fileExt}`;

        // Delete old avatar if exists
        if (selectedUser.avatar_url) {
          const oldPath = selectedUser.avatar_url.split("/").slice(-2).join("/");
          await supabase.storage.from("profile-images").remove([oldPath]);
        }

        const { error: uploadError } = await supabase.storage
          .from("profile-images")
          .upload(fileName, avatarFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("profile-images")
          .getPublicUrl(fileName);

        avatarUrl = publicUrl;
      } else if (!avatarPreview && selectedUser.avatar_url) {
        // Remove avatar if preview is cleared
        const oldPath = selectedUser.avatar_url.split("/").slice(-2).join("/");
        await supabase.storage.from("profile-images").remove([oldPath]);
        avatarUrl = null;
      }

      await Promise.all([
        updateRoleMutation.mutateAsync({
          userId: selectedUser.id,
          newRole: editRole,
        }),
        updateStatusMutation.mutateAsync({
          userId: selectedUser.id,
          newStatus: editStatus,
        }),
        updateProfileMutation.mutateAsync({
          userId: selectedUser.id,
          profileData: { ...editFormData, avatar_url: avatarUrl },
        }),
      ]);
    } catch (error: any) {
      toast.error(error.message || "Failed to update user");
    }
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate client selection for Client role
    if (role === "Client" && !selectedClientId) {
      toast.error("Please select a client for this user");
      return;
    }

    // Validate site selection for Contractor role
    if (role === "Contractor" && selectedSiteIds.length === 0) {
      toast.error("Please select at least one site for this contractor");
      return;
    }
    
    inviteMutation.mutate({ 
      email, 
      fullName, 
      role,
      temporaryPassword: temporaryPassword || undefined,
      clientId: role === "Client" ? selectedClientId : undefined,
      siteIds: role === "Contractor" ? selectedSiteIds : undefined
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage users and send invitations
          </p>
        </div>

        <div className="flex gap-2">
          <a href="/admin-client-preview" target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <Eye className="mr-2 h-4 w-4" />
              Preview Client Portal
            </Button>
          </a>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New User</DialogTitle>
              <DialogDescription>
                Set a temporary password for instant access, or leave blank to send an email invitation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={(value: any) => {
                    setRole(value);
                    if (value !== "Client") setSelectedClientId("");
                    if (value !== "Contractor") setSelectedSiteIds([]);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Moderator">Moderator</SelectItem>
                      <SelectItem value="User">User</SelectItem>
                      <SelectItem value="Contractor">Contractor</SelectItem>
                      <SelectItem value="Client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {role === "Client" && (
                  <div className="space-y-2">
                    <Label htmlFor="client">Assign to Client</Label>
                    <Select value={selectedClientId} onValueChange={setSelectedClientId} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.company_name || client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This user will only see data for the selected client.
                    </p>
                  </div>
                )}
                {role === "Contractor" && (
                  <div className="space-y-2">
                    <Label>Assign to Sites</Label>
                    <div className="border rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                      {sites && sites.length > 0 ? (
                        sites.map((site) => (
                          <label key={site.id} className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={selectedSiteIds.includes(site.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSiteIds([...selectedSiteIds, site.id]);
                                } else {
                                  setSelectedSiteIds(selectedSiteIds.filter(id => id !== site.id));
                                }
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-sm">{site.name}</div>
                              {site.address && (
                                <div className="text-xs text-muted-foreground">{site.address}</div>
                              )}
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-2">No sites available</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This contractor will only see inspections for the selected sites.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="temporaryPassword">Temporary Password (Optional)</Label>
                  <Input
                    id="temporaryPassword"
                    type="text"
                    placeholder="Leave blank to send email invite"
                    value={temporaryPassword}
                    onChange={(e) => setTemporaryPassword(e.target.value)}
                    minLength={6}
                  />
                  <p className="text-xs text-muted-foreground">
                    If set, user can login immediately and will be required to change password on first login.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Pending Invites Section */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Pending Invites</h2>
              <p className="text-sm text-muted-foreground">
                Users from Firebase migration waiting to be invited
              </p>
            </div>
          </div>
          
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">
                        {invite.full_name || 'N/A'}
                      </TableCell>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        {invite.invited_at ? (
                          <span className="text-sm text-muted-foreground">
                            Invited {new Date(invite.invited_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-sm text-amber-600 font-medium">
                            Not Invited
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => sendInviteMutation.mutate(invite)}
                          disabled={!!invite.invited_at || sendInviteMutation.isPending}
                        >
                          <Send className="mr-2 h-3 w-3" />
                          {invite.invited_at ? 'Resend' : 'Send Invite'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Active Users Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Active Users</h2>
          <p className="text-sm text-muted-foreground">
            Users who have accepted invitations and have active accounts
          </p>
        </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users && users.length > 0 ? (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name || "N/A"}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.status === "Active" ? "default" : "outline"}>
                      {user.status || "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleEditUser(user)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => {
                            setResendUser(user);
                            setResendOpen(true);
                          }}
                        >
                          <Mail className="mr-2 h-4 w-4" />
                          Reset Password
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No users found. Invite your first user to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information, role, and status
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Profile Image Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Profile Image</h3>
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarPreview} alt={editFormData.full_name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    {getInitials(editFormData.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Label
                      htmlFor="avatar-upload"
                      className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Image
                    </Label>
                    <Input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    {avatarPreview && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveAvatar}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG or WEBP. Max 5MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Account Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Account Information</h3>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" value={selectedUser?.email || ""} disabled className="bg-muted" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select value={editRole} onValueChange={(value: any) => setEditRole(value)}>
                    <SelectTrigger id="edit-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Moderator">Moderator</SelectItem>
                      <SelectItem value="User">User</SelectItem>
                      <SelectItem value="Contractor">Contractor</SelectItem>
                      <SelectItem value="Client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select value={editStatus} onValueChange={(value: any) => setEditStatus(value)}>
                    <SelectTrigger id="edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Personal Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-full-name">Full Name</Label>
                  <Input
                    id="edit-full-name"
                    value={editFormData.full_name}
                    onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                    placeholder="Thabo Mbeki"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone Number</Label>
                  <Input
                    id="edit-phone"
                    type="tel"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="+27 82 123 4567"
                  />
                </div>
              </div>
            </div>

            {/* Professional Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Professional Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-job-title">Job Title</Label>
                  <Input
                    id="edit-job-title"
                    value={editFormData.job_title}
                    onChange={(e) => setEditFormData({ ...editFormData, job_title: e.target.value })}
                    placeholder="Electrical Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-department">Department</Label>
                  <Input
                    id="edit-department"
                    value={editFormData.department}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    placeholder="Engineering"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-company">Company</Label>
                <Input
                  id="edit-company"
                  value={editFormData.company}
                  onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                  placeholder="Eskom Holdings"
                />
              </div>
            </div>

            {/* Location Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Location</h3>
              <div className="space-y-2">
                <Label htmlFor="edit-address">Street Address</Label>
                <Input
                  id="edit-address"
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  placeholder="123 Nelson Mandela Boulevard"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-city">City</Label>
                  <Input
                    id="edit-city"
                    value={editFormData.city}
                    onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                    placeholder="Johannesburg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-country">Country</Label>
                  <Input
                    id="edit-country"
                    value={editFormData.country || "South Africa"}
                    onChange={(e) => setEditFormData({ ...editFormData, country: e.target.value })}
                    placeholder="South Africa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-postal-code">Postal Code</Label>
                  <Input
                    id="edit-postal-code"
                    value={editFormData.postal_code}
                    onChange={(e) => setEditFormData({ ...editFormData, postal_code: e.target.value })}
                    placeholder="2001"
                  />
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Additional Information</h3>
              <div className="space-y-2">
                <Label htmlFor="edit-bio">Bio / Notes</Label>
                <Textarea
                  id="edit-bio"
                  value={editFormData.bio}
                  onChange={(e) => setEditFormData({ ...editFormData, bio: e.target.value })}
                  placeholder="Additional notes about this user..."
                  rows={3}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={updateRoleMutation.isPending || updateStatusMutation.isPending || updateProfileMutation.isPending}
            >
              {(updateRoleMutation.isPending || updateStatusMutation.isPending || updateProfileMutation.isPending) ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resendOpen} onOpenChange={setResendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Set a temporary password for {resendUser?.full_name || resendUser?.email}, or leave blank to send an email invitation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resendTempPassword">Temporary Password (Optional)</Label>
              <Input
                id="resendTempPassword"
                type="text"
                placeholder="Leave blank to send email invite"
                value={resendTempPassword}
                onChange={(e) => setResendTempPassword(e.target.value)}
                minLength={6}
              />
              <p className="text-xs text-muted-foreground">
                If set, user can login immediately and will be required to change password on first login.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setResendOpen(false);
                setResendTempPassword("");
                setResendUser(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (resendUser) {
                  resendInviteMutation.mutate({
                    user: resendUser,
                    temporaryPassword: resendTempPassword || undefined
                  });
                }
              }}
              disabled={resendInviteMutation.isPending}
            >
              {resendInviteMutation.isPending ? "Processing..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Users;
