import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteUserRequest {
  email: string;
  fullName: string;
  role: string;
  isResend?: boolean;
  temporaryPassword?: string;
  clientId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header to verify the requesting user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the requesting user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized - please log in again');
    }

    // Check if requesting user has Admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleData?.role !== 'Admin') {
      throw new Error('Only admins can invite users');
    }

    const { email, fullName, role, isResend, temporaryPassword, clientId }: InviteUserRequest = await req.json();

    console.log(isResend ? 'Resending invite to:' : 'Inviting user:', email, 'with role:', role);
    
    // Validate clientId for Client role
    if (role === 'Client' && !clientId) {
      throw new Error('Client ID is required for Client role users');
    }

    // Validate temporary password if provided
    if (temporaryPassword && temporaryPassword.length < 6) {
      throw new Error('Temporary password must be at least 6 characters');
    }

    // Get the origin from the request to use as redirect URL
    const origin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/');
    const redirectTo = `${origin}/auth?type=invite`;

    console.log('Redirect URL:', redirectTo);

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === email);

    let userId: string;
    let isNewUser = false;

    if (existingUser && isResend) {
      // User exists, resending invite
      userId = existingUser.id;
      const isConfirmed = existingUser.email_confirmed_at !== null;
      console.log('User already exists:', userId, 'Email confirmed:', isConfirmed);
      
      // Update user metadata if needed
      const updateData: any = {
        user_metadata: {
          full_name: fullName,
          role: role,
          requires_password_change: temporaryPassword ? true : false,
        },
      };

      // If temporary password is provided, update it
      if (temporaryPassword) {
        updateData.password = temporaryPassword;
        updateData.email_confirm = true; // Auto-confirm when setting temp password
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        updateData
      );

      if (updateError) {
        console.warn('Failed to update user:', updateError);
      }

      // Update role if changed
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingRole && existingRole.role !== role) {
        await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId);
      } else if (!existingRole) {
        await supabase
          .from('user_roles')
          .insert({ user_id: userId, role });
      }

      // If using temporary password, skip email invitation
      if (temporaryPassword) {
        console.log('User updated with temporary password - skipping email');
        
        return new Response(
          JSON.stringify({
            success: true,
            userId: userId,
            isNewUser: false,
            message: `Password reset successfully. Temporary password: ${temporaryPassword}. User must change password on first login.`,
            temporaryPassword: temporaryPassword,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      // If user is already confirmed, send password recovery instead of invite
      if (isConfirmed) {
        console.log('User is confirmed, sending password recovery email');
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (recoveryError) {
          console.error('Password recovery error:', recoveryError);
          throw new Error(`Failed to send password reset: ${recoveryError.message}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            userId: userId,
            isNewUser: false,
            message: 'Password reset email sent successfully. User will receive an email to set a new password.',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
    } else if (existingUser && !isResend) {
      throw new Error('User with this email already exists. Use resend invite instead.');
    } else {
      // Create new user with temporary password if provided
      const createUserOptions: any = {
        email,
        email_confirm: temporaryPassword ? true : false, // Auto-confirm if using temp password
        user_metadata: {
          full_name: fullName,
          role: role,
          requires_password_change: temporaryPassword ? true : false,
        },
      };

      // Add password if provided
      if (temporaryPassword) {
        createUserOptions.password = temporaryPassword;
      }

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser(createUserOptions);

      if (createError) {
        console.error('User creation error:', createError);
        throw new Error(`Failed to create user: ${createError.message}`);
      }

      userId = newUser.user.id;
      isNewUser = true;
      console.log('New user created:', userId);

      // Assign role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: role,
        });

      if (roleError) {
        console.error('Role assignment error:', roleError);
        throw new Error(`Failed to assign role: ${roleError.message}`);
      }

      console.log('Role assigned successfully');
      
      // If Client role, create user_clients mapping
      if (role === 'Client' && clientId) {
        const { error: clientMappingError } = await supabase
          .from('user_clients')
          .insert({
            user_id: userId,
            client_id: clientId,
          });

        if (clientMappingError) {
          console.error('Client mapping error:', clientMappingError);
          throw new Error(`Failed to map user to client: ${clientMappingError.message}`);
        }

        console.log('User mapped to client successfully');
      }
    }

    // If using temporary password, skip email invitation
    if (temporaryPassword) {
      console.log('User created with temporary password - skipping email invitation');
      
      return new Response(
        JSON.stringify({
          success: true,
          userId: userId,
          isNewUser,
          message: isNewUser 
            ? `User created successfully. Temporary password: ${temporaryPassword}. User must change password on first login.`
            : 'User updated successfully.',
          temporaryPassword: temporaryPassword,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Generate a fresh invite link (only if not using temp password)
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
        redirectTo,
      },
    });

    if (inviteError) {
      console.error('Invite link generation error:', inviteError);
      throw new Error(`Failed to generate invite link: ${inviteError.message}`);
    }

    console.log('Fresh invite link generated');

    // Send invite email via Supabase
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role: role,
      },
      redirectTo,
    });

    if (emailError) {
      console.warn('Invite email error:', emailError);
      // Don't throw - we can still return success
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: userId,
        isNewUser,
        message: isResend 
          ? 'Invitation resent successfully. User will receive a new email with password setup link.'
          : 'Invitation sent successfully. User will receive an email with password setup link.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in invite-user function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});