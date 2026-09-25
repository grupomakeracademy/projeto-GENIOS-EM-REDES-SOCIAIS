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

  console.log('====================================================');
  console.log('AUDITORIA DE LOGIN PARA:', email);
  console.log('====================================================\n');

  // 1. Test exact signInWithPassword via anon client (same as user login)
  console.log('[1] Executando anon.auth.signInWithPassword...');
  const start = Date.now();
  const loginRes = await anon.auth.signInWithPassword({
    email,
    password,
  });
  console.log('Tempo de resposta:', Date.now() - start, 'ms');
  console.log('Data:', loginRes.data ? { user: loginRes.data.user?.id, session: Boolean(loginRes.data.session) } : null);
  console.log('Error retornado pelo Supabase:');
  if (loginRes.error) {
    console.log({
      name: loginRes.error.name,
      message: loginRes.error.message,
      status: loginRes.error.status,
      code: loginRes.error.code,
    });
  } else {
    console.log('Nenhum erro! Login bem-sucedido!');
  }

  // 2. Search for the user in Supabase Auth via admin API
  console.log('\n[2] Buscando usuário via admin.auth.admin.listUsers()...');
  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) {
    console.error('Erro ao listar usuários:', usersErr);
  } else {
    const found = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      console.log('Usuário encontrado na lista do Admin!');
      console.log({
        id: found.id,
        email: found.email,
        phone: found.phone,
        confirmed_at: found.confirmed_at,
        email_confirmed_at: found.email_confirmed_at,
        last_sign_in_at: found.last_sign_in_at,
        app_metadata: found.app_metadata,
        user_metadata: found.user_metadata,
        banned_until: found.banned_until,
      });
    } else {
      console.log('ATENÇÃO: Usuário NÃO encontrado em admin.listUsers() com o email exato:', email);
      console.log('Todos os emails de usuários existentes:');
      usersData.users.forEach(u => console.log(' -', u.email));
    }
  }

  // 3. Query PostgreSQL auth.users directly to inspect constraints, identities, provider
  console.log('\n[3] Consultando PostgreSQL auth.users diretamente...');
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const directUser = await client.query(`
      SELECT id, email, encrypted_password, email_confirmed_at, invited_at,
             confirmation_token, recovery_token, email_change_token_new,
             email_change, email_change_sent_at, last_sign_in_at,
             raw_app_meta_data, raw_user_meta_data, is_super_admin,
             created_at, updated_at, phone, phone_confirmed_at,
             confirmation_sent_at, recovery_sent_at, email_change_token_current,
             email_change_confirm_status, banned_until, reauthentication_token,
             reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
      FROM auth.users
      WHERE lower(email) = lower($1);
    `, [email]);

    console.log(`Linhas retornadas em auth.users para ${email}:`, directUser.rows.length);
    if (directUser.rows.length > 0) {
      const u = directUser.rows[0];
      console.log('Dados do usuário em auth.users:');
      console.log({
        id: u.id,
        email: u.email,
        email_confirmed_at: u.email_confirmed_at,
        last_sign_in_at: u.last_sign_in_at,
        banned_until: u.banned_until,
        deleted_at: u.deleted_at,
        has_encrypted_password: Boolean(u.encrypted_password),
        raw_app_meta_data: u.raw_app_meta_data,
        raw_user_meta_data: u.raw_user_meta_data,
      });

      // Also check auth.identities
      const identities = await client.query(`
        SELECT id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        FROM auth.identities
        WHERE user_id = $1;
      `, [u.id]);
      console.log('Identidades associadas:', identities.rows);
    } else {
      // Check similar emails
      const similar = await client.query(`
        SELECT email FROM auth.users WHERE email ILIKE '%maker%' OR email ILIKE '%barros%' OR email ILIKE '%genios%';
      `);
      console.log('Emails similares encontrados em auth.users:', similar.rows.map(r => r.email));
    }
  } catch (err) {
    console.error('Erro na consulta postgres:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
