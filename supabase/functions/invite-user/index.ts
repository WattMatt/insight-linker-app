import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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
  siteIds?: string[];
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

    const { email, fullName, role, isResend, temporaryPassword, clientId, siteIds }: InviteUserRequest = await req.json();

    console.log(isResend ? 'Resending invite to:' : 'Inviting user:', email, 'with role:', role);
    
    // Validate clientId for Client role
    if (role === 'Client' && !clientId) {
      throw new Error('Client ID is required for Client role users');
    }

    // Validate siteIds for Contractor role
    if (role === 'Contractor' && (!siteIds || siteIds.length === 0)) {
      throw new Error('At least one site must be assigned for Contractor role users');
    }

    // Validate temporary password if provided
    if (temporaryPassword && temporaryPassword.length < 6) {
      throw new Error('Temporary password must be at least 6 characters');
    }

    // Redirect base from env, NOT the request origin — a preview deployment or a
    // spoofed Origin/Referer header must never end up in invite links. Mirrors
    // send-password-reset (APP_URL). Feeds both redirectTo and recoveryRedirect below.
    const origin = Deno.env.get('APP_URL') ?? 'https://insight-linker-app.vercel.app';
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

      // Update client mapping if Client role
      if (role === 'Client' && clientId) {
        // Check if mapping exists
        const { data: existingMapping } = await supabase
          .from('user_clients')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existingMapping) {
          await supabase
            .from('user_clients')
            .update({ client_id: clientId })
            .eq('user_id', userId);
        } else {
          await supabase
            .from('user_clients')
            .insert({ user_id: userId, client_id: clientId });
        }
      }

      // Update site mappings if Contractor role
      if (role === 'Contractor' && siteIds && siteIds.length > 0) {
        // Delete existing site mappings
        await supabase
          .from('user_sites')
          .delete()
          .eq('user_id', userId);

        // Insert new site mappings
        const siteMappings = siteIds.map(siteId => ({
          user_id: userId,
          site_id: siteId,
        }));

        await supabase
          .from('user_sites')
          .insert(siteMappings);

        console.log(`Updated user site assignments to ${siteIds.length} site(s)`);
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
        const recoveryRedirect = `${origin}/auth`;
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: recoveryRedirect,
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

      // Assign role (handle case where trigger already created one)
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role if different
        if (existingRole.role !== role) {
          const { error: roleError } = await supabase
            .from('user_roles')
            .update({ role })
            .eq('user_id', userId);

          if (roleError) {
            console.error('Role update error:', roleError);
            throw new Error(`Failed to update role: ${roleError.message}`);
          }
          console.log('Role updated successfully');
        } else {
          console.log('Role already assigned correctly');
        }
      } else {
        // Insert new role
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
      }
      
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

      // If Contractor role, create user_sites mappings
      if (role === 'Contractor' && siteIds && siteIds.length > 0) {
        const siteMappings = siteIds.map(siteId => ({
          user_id: userId,
          site_id: siteId,
        }));

        const { error: siteMappingError } = await supabase
          .from('user_sites')
          .insert(siteMappings);

        if (siteMappingError) {
          console.error('Site mapping error:', siteMappingError);
          throw new Error(`Failed to map user to sites: ${siteMappingError.message}`);
        }

        console.log(`User mapped to ${siteIds.length} site(s) successfully`);
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
    
    // Get the magic link URL from the generated link
    const inviteUrl = inviteData?.properties?.action_link || redirectTo;

    // Send branded invite email via Resend
    const { data: companySettings } = await supabase
      .from('settings')
      .select('company_name, logo_url')
      .single();

    const companyName = companySettings?.company_name || 'WM Compliance';
    const logoUrl = companySettings?.logo_url;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 60px; max-width: 200px;">` : `<h1 style="margin: 0; color: #18181b; font-size: 24px; font-weight: 700;">${companyName}</h1>`}
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px; font-weight: 600;">
                Welcome, ${fullName}!
              </h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                You've been invited to join <strong>${companyName}</strong> as a <strong style="color: #2563eb;">${role}</strong>.
              </p>
              <p style="margin: 0 0 32px; color: #52525b; font-size: 16px; line-height: 1.6;">
                Click the button below to set up your password and access your account.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 32px 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 8px 0 0; word-break: break-all;">
                <a href="${inviteUrl}" style="color: #2563eb; font-size: 14px;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #71717a; font-size: 12px; text-align: center;">
                This invitation was sent by ${companyName}. If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: `${companyName} <noreply@watsonmattheus.com>`,
      to: [email],
      subject: `You're invited to join ${companyName}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error('Resend email error:', emailError);
      throw new Error(`Failed to send invite email: ${emailError.message}`);
    }

    console.log('Invite email sent via Resend');

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