// Edge Function: admin-invite
// Admin-only user creation. Verifies the caller is an admin (via their JWT and
// fintrack_profiles.role), then creates the auth user with the service role.
// deno-lint-ignore-file
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) return json({ error: 'missing authorization' }, 401);

    // Caller identity from their JWT
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return json({ error: 'unauthorized' }, 401);

    // Admin check
    const { data: profile } = await anon
      .from('fintrack_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'admin') return json({ error: 'forbidden: admin only' }, 403);

    const { email, password, name } = await req.json();
    if (!email || typeof email !== 'string') return json({ error: 'email is required' }, 400);
    if (!password || typeof password !== 'string' || password.length < 6)
      return json({ error: 'password of at least 6 characters is required' }, 400);

    // Create the user with the service role (email confirmed — admin sets the password)
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data, error } = await service.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: name ? { name } : undefined,
    });
    if (error) return json({ error: error.message }, 400);

    // Ensure the profile row exists with role 'user'
    if (data.user) {
      await service.from('fintrack_profiles').upsert({
        id: data.user.id,
        email: email.trim().toLowerCase(),
        name: name || 'My Business',
        role: 'user',
      }, { onConflict: 'id' });
    }

    return json({ id: data.user?.id, email: email.trim().toLowerCase() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
