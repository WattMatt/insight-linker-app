import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Every member of the public.app_role enum (CREATE TYPE in the 20251014 migration,
// then the 20251014 / 20251017 ADD VALUEs). Anything outside this list cannot be
// stored in user_roles, and the role decides what the invited user can see, so it
// is checked up front instead of surfacing as an enum error at the insert.
const ALLOWED_ROLES = ['Admin', 'User', 'Contractor', 'Moderator', 'Client'];

// auth.admin.listUsers() is paginated and defaults to 50 users per page. The page
// cap bounds the walk so an API that keeps returning full pages cannot spin here.
const USER_PAGE_SIZE = 200;
const MAX_USER_PAGES = 50;

interface InviteUserRequest {
  email: string;
  fullName: string;
  role: string;
  isResend?: boolean;
  temporaryPassword?: string;
  clientId?: string;
  siteIds?: string[];
  // When true, the initial password is delivered to the user in a branded email
  // (with a forced-change-on-first-login notice) instead of being returned to the
  // admin to relay by hand. Requires `temporaryPassword` to be present — the admin
  // UI generates it with src/lib/auth/initialInvite.ts:generateInitialPassword().
  deliverByEmail?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Branded "your account is ready" email carrying the one-time initial password.
 * Mirrors the invite/reset templates below (same table layout + brand header) so
 * all three transactional emails look consistent. The password is shown in a
 * monospace box and paired with a prominent must-change-on-first-login notice.
 */
function renderInitialPasswordEmailHtml(params: {
  companyName: string;
  logoUrl?: string | null;
  fullName: string;
  role: string;
  email: string;
  password: string;
  loginUrl: string;
}): string {
  const { companyName, logoUrl, fullName, role, email, password, loginUrl } = params;
  const brand = escapeHtml(companyName);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${brand} account is ready</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${brand}" style="max-height: 60px; max-width: 200px;">` : `<h1 style="margin: 0; color: #18181b; font-size: 24px; font-weight: 700;">${brand}</h1>`}
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px; font-weight: 600;">
                Welcome, ${escapeHtml(fullName)}!
              </h2>
              <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
                An account has been created for you on <strong>${brand}</strong> as a
                <strong style="color: #2563eb;">${escapeHtml(role)}</strong>. Use the details below to sign in.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px; background-color: #f8fafc; border: 1px solid #e4e4e7; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px; color: #71717a; font-size: 13px;">Email</p>
                    <p style="margin: 0 0 16px; color: #18181b; font-size: 15px; font-weight: 600;">${escapeHtml(email)}</p>
                    <p style="margin: 0 0 6px; color: #71717a; font-size: 13px;">Temporary password</p>
                    <p style="margin: 0; color: #18181b; font-size: 18px; font-weight: 700; font-family: 'SF Mono', Menlo, Consolas, monospace; letter-spacing: 1px;">${escapeHtml(password)}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(loginUrl)}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                      Sign in
                    </a>
                  </td>
                </tr>
              </table>

              <div style="margin-top: 32px; padding: 16px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  <strong>For your security</strong>, you'll be asked to choose your own password the first time you sign in. This temporary password stops working once you do.
                </p>
              </div>

              <p style="margin: 24px 0 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                If the button doesn't work, go to:
              </p>
              <p style="margin: 8px 0 0; word-break: break-all;">
                <a href="${escapeHtml(loginUrl)}" style="color: #2563eb; font-size: 14px;">${escapeHtml(loginUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; color: #71717a; font-size: 12px; text-align: center;">
                This account was created by ${brand}. If you weren't expecting it, please contact your administrator.
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
}

/**
 * Fetch branding and send the initial-password email. Throws on send failure so
 * the caller can surface it (a user who never receives credentials is a failed
 * invite, not a silent success).
 */
async function sendInitialPasswordEmail(
  supabase: ReturnType<typeof createClient>,
  params: { email: string; fullName: string; role: string; password: string; origin: string },
): Promise<void> {
  const { data: settings } = await supabase
    .from('settings')
    .select('company_name, company_logo_url')
    .single();

  const companyName = settings?.company_name || 'WM Compliance';
  const logoUrl = settings?.company_logo_url as string | undefined;

  const html = renderInitialPasswordEmailHtml({
    companyName,
    logoUrl,
    fullName: params.fullName,
    role: params.role,
    email: params.email,
    password: params.password,
    loginUrl: `${params.origin}/auth/login`,
  });

  const { error: emailError } = await resend.emails.send({
    from: `${companyName} <noreply@watsonmattheus.com>`,
    to: [params.email],
    subject: `Your ${companyName} account is ready`,
    html,
  });

  if (emailError) {
    console.error('Initial-password email error:', emailError);
    throw new Error(
      `Failed to email login details: ${emailError.message}. The account and its password are already set - use Resend on the user's row to retry delivery.`,
    );
  }
}

/**
 * Look up the auth account for an email, if there is one. listUsers() returns one
 * page at a time, so a single call only ever sees the first 50 accounts: past that
 * an existing user looks new, the caller takes the create branch, and Supabase
 * rejects the duplicate address. Pages are walked until the email is found or a
 * page comes back empty. Running out of pages means the answer is unknown, and an
 * unknown answer must not be reported as "no such account".
 */
async function findUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
) {
  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USER_PAGE_SIZE,
    });

    if (error) {
      console.error(`Existing-user lookup error on page ${page}:`, error);
      throw new Error(
        `Could not check whether ${email} already has an account: ${error.message}. Retry the invite; if it keeps failing, check the function's SUPABASE_SERVICE_ROLE_KEY.`,
      );
    }

    // Only an empty page ends the walk. A short page is deliberately not used as
    // the terminator: if the API ever caps perPage below what we ask for, every
    // page looks short and the walk stops on the first one, missing exactly the
    // accounts it is here to find. One extra round trip is the cheaper risk.
    const users = data?.users ?? [];
    if (users.length === 0) {
      return undefined;
    }

    const match = users.find(u => u.email === email);
    if (match) {
      return match;
    }
  }

  throw new Error(
    `Could not confirm whether ${email} already has an account after checking ${MAX_USER_PAGES * USER_PAGE_SIZE} of them. Find the user in Supabase Auth and use Resend on their existing row instead.`,
  );
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
      throw new Error('No authorization header - sign out, sign back in, and send the invite again.');
    }

    // Verify the requesting user is an admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized - please log in again');
    }

    // Check if requesting user has Admin role. maybeSingle() fails when the query
    // matches more than one row, and user_roles is UNIQUE(user_id, role) rather
    // than one row per user — so a second role row is a failed lookup, not proof
    // that the caller is not an admin, and must not be reported as one.
    const { data: roleData, error: roleLookupError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleLookupError) {
      console.error('Admin role lookup error:', roleLookupError);
      throw new Error(
        `Could not resolve your role: ${roleLookupError.message}. Check user_roles for user_id ${user.id} - inviting requires your account to have exactly one role row.`,
      );
    }

    if (!roleData) {
      throw new Error('Only admins can invite users - your account has no role assigned. Ask another admin to give you the Admin role.');
    }

    if (roleData.role !== 'Admin') {
      throw new Error(`Only admins can invite users - your role is ${roleData.role}.`);
    }

    const { email, fullName, role, isResend, temporaryPassword, clientId, siteIds, deliverByEmail }: InviteUserRequest = await req.json();

    // The role reaches user_metadata and the user_roles insert unchecked, so an
    // absent or unknown one is rejected here. Never substitute a default: which
    // role someone gets is an authorization decision, not ours to guess.
    if (!role) {
      throw new Error(
        `No role was supplied for ${email}. Choose a role (${ALLOWED_ROLES.join(', ')}) for the user, then send the invite again.`,
      );
    }

    if (!ALLOWED_ROLES.includes(role)) {
      throw new Error(
        `Unknown role "${role}" for ${email}. Choose one of: ${ALLOWED_ROLES.join(', ')}.`,
      );
    }

    // Emailing credentials requires a password to email. Fail loud rather than
    // silently create an account the user can never reach.
    if (deliverByEmail && !temporaryPassword) {
      throw new Error('deliverByEmail requires an initial password to be provided - send the invite without emailing the password, or supply one.');
    }

    console.log(isResend ? 'Resending invite to:' : 'Inviting user:', email, 'with role:', role);
    
    // Validate clientId for Client role
    if (role === 'Client' && !clientId) {
      throw new Error('Client ID is required for Client role users - pick the client the user belongs to, then send the invite again.');
    }

    // Validate siteIds for Contractor role
    if (role === 'Contractor' && (!siteIds || siteIds.length === 0)) {
      throw new Error('At least one site must be assigned for Contractor role users - select their sites, then send the invite again.');
    }

    // Validate temporary password if provided
    if (temporaryPassword && temporaryPassword.length < 6) {
      throw new Error('Temporary password must be at least 6 characters - enter a longer one and send the invite again.');
    }

    // Redirect base from env, NOT the request origin — a preview deployment or a
    // spoofed Origin/Referer header must never end up in invite links. Mirrors
    // send-password-reset (APP_URL). Feeds both redirectTo and recoveryRedirect below.
    const origin = Deno.env.get('APP_URL') ?? 'https://insight-linker-app.vercel.app';
    const redirectTo = `${origin}/auth?type=invite`;

    console.log('Redirect URL:', redirectTo);

    // Check if user already exists
    const existingUser = await findUserByEmail(supabase, email);

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

      // Temporary password path.
      if (temporaryPassword) {
        if (deliverByEmail) {
          // Email the credentials to the user (never echo the plaintext back to
          // the admin — one delivery channel, not two).
          await sendInitialPasswordEmail(supabase, {
            email,
            fullName,
            role,
            password: temporaryPassword,
            origin,
          });
          console.log('User updated with temporary password - login details emailed');
          return new Response(
            JSON.stringify({
              success: true,
              userId: userId,
              isNewUser: false,
              passwordEmailed: true,
              message: 'Login details emailed to the user. They must change the password on first login.',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
          );
        }

        // Legacy path: admin relays the password out-of-band.
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
          throw new Error(
            `Failed to send password reset: ${recoveryError.message}. The account is unchanged - check the project's Auth email settings, then try again.`,
          );
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
        throw new Error(
          `Failed to create user: ${createError.message}. If it says the address is already registered, reload the user list and use Resend on their row instead.`,
        );
      }

      userId = newUser.user.id;
      isNewUser = true;
      console.log('New user created:', userId);

      // Audit trail (G-SEC-04 / POPIA §16). Best-effort: an audit failure must
      // never abort user creation.
      try {
        await supabase.from('auth_events').insert({
          user_id: userId,
          event_type: 'user_created',
          metadata: { role, invited_by: user.id, via: 'invite-user' },
        });
      } catch (auditErr) {
        console.warn('auth_events user_created insert failed (non-fatal):', auditErr);
      }

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
            throw new Error(
              `Failed to update role: ${roleError.message}. The account exists but still holds its previous role - use Resend on their row to try again.`,
            );
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
          throw new Error(
            `Failed to assign role: ${roleError.message}. The account exists with no role and cannot sign in usefully - use Resend on their row to finish setting it up.`,
          );
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
          throw new Error(
            `Failed to map user to client: ${clientMappingError.message}. The account exists but is not linked to the client, so it will see nothing - use Resend on their row to retry the link.`,
          );
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
          throw new Error(
            `Failed to map user to sites: ${siteMappingError.message}. The account exists but has no site assignments - use Resend on their row to retry them.`,
          );
        }

        console.log(`User mapped to ${siteIds.length} site(s) successfully`);
      }
    }

    // Temporary password path.
    if (temporaryPassword) {
      if (deliverByEmail) {
        await sendInitialPasswordEmail(supabase, {
          email,
          fullName,
          role,
          password: temporaryPassword,
          origin,
        });
        console.log('User created with temporary password - login details emailed');
        return new Response(
          JSON.stringify({
            success: true,
            userId: userId,
            isNewUser,
            passwordEmailed: true,
            message: 'User created. Login details emailed. They must change the password on first login.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );
      }

      // Legacy path: admin relays the password out-of-band.
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
      throw new Error(
        `Failed to generate invite link: ${inviteError.message}. The account is set up but no email went out - use Resend on their row to try again.`,
      );
    }

    console.log('Fresh invite link generated');
    
    // Get the magic link URL from the generated link
    const inviteUrl = inviteData?.properties?.action_link || redirectTo;

    // Send branded invite email via Resend
    const { data: companySettings } = await supabase
      .from('settings')
      .select('company_name, company_logo_url')
      .single();

    const companyName = companySettings?.company_name || 'WM Compliance';
    const logoUrl = companySettings?.company_logo_url;

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
      throw new Error(
        `Failed to send invite email: ${emailError.message}. The account and invite link exist but the email did not send - use Resend on their row to try again.`,
      );
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