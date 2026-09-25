import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

const anon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const email = 'grupomakeracademy@gmail.com';
  const password = 'KentinGenios123#';

  console.log('--- PROVISIONAMENTO E VERIFICAÇÃO DE LOGIN ---');
  console.log('Email:', email);

  // 1. Check if user already exists
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  let user = listData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    console.log('[1] Criando usuário no Supabase Auth via adminClient...');
    const createRes = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Maker Academy' },
    });
    if (createRes.error) {
      console.error('Erro ao criar usuário:', createRes.error);
      throw createRes.error;
    }
    user = createRes.data.user;
    console.log('Usuário criado com sucesso. ID:', user.id);
  } else {
    console.log('[1] Usuário já existia no Auth. ID:', user.id);
    // Ensure email is confirmed and password is set
    const updateRes = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Maker Academy' },
    });
    if (updateRes.error) {
      console.error('Erro ao atualizar usuário:', updateRes.error);
      throw updateRes.error;
    }
    user = updateRes.data.user;
    console.log('Usuário atualizado com confirmação de email e senha.');
  }

  // 2. Ensure profile and workspace memberships in Postgres
  console.log('[2] Configurando perfil e associações de workspace...');
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    // Check profile
    await client.query(
      `
      INSERT INTO public.profiles (id, name, locale, storage_quota_mb, content_quota_balance, content_quota_total_assigned, content_quota_total_consumed, onboarding_draft)
      VALUES ($1, 'Maker Academy', 'pt-BR', 500, 100, 100, 0, '{}'::jsonb)
      ON CONFLICT (id) DO UPDATE
      SET name = 'Maker Academy',
          locale = 'pt-BR',
          storage_quota_mb = COALESCE(public.profiles.storage_quota_mb, 500),
          content_quota_balance = COALESCE(public.profiles.content_quota_balance, 100);
    `,
      [user.id],
    );
    console.log('Perfil garantido em public.profiles.');

    // Associate with Maker Academy workspace (5ba1005e-7eda-4a2d-899d-08e411ac011c)
    await client.query(
      `
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES ('5ba1005e-7eda-4a2d-899d-08e411ac011c', $1, 'ADMIN')
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
    `,
      [user.id],
    );

    // Also associate with Geninhos workspace (b7b42d2d-2b9a-43ce-8757-95f3580d2de4)
    await client.query(
      `
      INSERT INTO public.workspace_members (workspace_id, user_id, role)
      VALUES ('b7b42d2d-2b9a-43ce-8757-95f3580d2de4', $1, 'ADMIN')
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
    `,
      [user.id],
    );
    console.log('Associações em public.workspace_members adicionadas com sucesso.');

    // Query active memberships
    const memberships = await client.query(
      `
      SELECT wm.workspace_id, w.name, wm.role
      FROM public.workspace_members wm
      JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = $1;
    `,
      [user.id],
    );
    console.log('Workspaces vinculados ao usuário:', memberships.rows);
  } finally {
    client.release();
    await pool.end();
  }

  // 3. Real login test using anon client (exact frontend flow)
  console.log('\n[3] Testando login real com signInWithPassword...');
  const loginRes = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (loginRes.error) {
    console.error('FALHA NO LOGIN:', loginRes.error);
    process.exit(1);
  }

  console.log('SUCESSO TOTAL NO LOGIN!');
  console.log('User ID:', loginRes.data.user.id);
  console.log('Email:', loginRes.data.user.email);
  console.log('Email confirmado em:', loginRes.data.user.email_confirmed_at);
  console.log('Sessão emitida:', Boolean(loginRes.data.session));
  console.log('Access token gerado:', Boolean(loginRes.data.session?.access_token));
  console.log('Refresh token gerado:', Boolean(loginRes.data.session?.refresh_token));
}

main().catch(console.error);
