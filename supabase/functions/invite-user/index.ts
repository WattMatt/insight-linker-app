import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteUserRequest {
  email: string;
  fullName: string;
  role: string;
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
      throw new Error('Unauthorized');
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

    const { email, fullName, role }: InviteUserRequest = await req.json();

    console.log('Inviting user:', email, 'with role:', role);

    // Get the origin from the request to use as redirect URL
    const origin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/');
    const redirectTo = `${origin}/auth?type=invite`;

    console.log('Redirect URL:', redirectTo);

    // Generate an invite link for the user
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
      throw inviteError;
    }

    console.log('Invite link generated for:', email);

    // Create the user with the hashed password from the invite
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        role: role,
      },
    });

    if (createError) {
      console.error('User creation error:', createError);
      throw createError;
    }

    console.log('User created:', newUser.user.id);

    // Assign role using service role (bypasses RLS)
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: newUser.user.id,
        role: role,
      });

    if (roleError) {
      console.error('Role assignment error:', roleError);
      throw roleError;
    }

    console.log('Role assigned successfully');

    // Note: In production, send inviteData.properties.action_link via your email service
    // For now, we'll rely on Supabase's built-in email
    const { error: emailError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role: role,
      },
      redirectTo,
    });

    if (emailError) {
      console.warn('Invite email error:', emailError);
      // Continue even if email fails - admin can manually share the link
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUser.user.id,
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
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});