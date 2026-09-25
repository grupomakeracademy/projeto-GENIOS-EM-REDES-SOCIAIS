import { createClient } from '@supabase/supabase-js';
import { translate } from '../src/lib/i18n.ts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const anon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function testFlow() {
  console.log('=== TESTE DO FLUXO COMPLETO DE AUTENTICAÇÃO ===\n');

  // Test 1: Successful login
  console.log('[TESTE 1] Tentativa de login COM CREDENCIAIS CORRETAS:');
  const res1 = await anon.auth.signInWithPassword({
    email: 'grupomakeracademy@gmail.com',
    password: 'KentinGenios123#',
  });

  if (res1.error) {
    console.error('ERRO INESPERADO NO TESTE 1:', res1.error);
    process.exit(1);
  }
  console.log('✔ Login bem-sucedido!');
  console.log('  - User ID:', res1.data.user.id);
  console.log('  - Email:', res1.data.user.email);
  console.log('  - Email confirmado:', Boolean(res1.data.user.email_confirmed_at));
  console.log('  - Access token gerado com sucesso:', Boolean(res1.data.session?.access_token));

  // Test 1.1: Verify user can access workspace with their session
  const authenticatedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${res1.data.session.access_token}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: memberWorkspaces, error: wsErr } = await authenticatedClient
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', res1.data.user.id);

  if (wsErr) {
    console.error('Erro ao consultar workspaces com o token autenticado:', wsErr);
    process.exit(1);
  }
  console.log('✔ Acesso autenticado aos workspaces confirmado:', memberWorkspaces);

  // Test 2: Invalid password
  console.log('\n[TESTE 2] Tentativa de login com SENHA INCORRETA:');
  const res2 = await anon.auth.signInWithPassword({
    email: 'grupomakeracademy@gmail.com',
    password: 'WrongPassword123!',
  });

  console.log('✔ Resposta do Supabase para senha incorreta:');
  console.log('  - Status:', res2.error?.status);
  console.log('  - Code:', res2.error?.code);
  console.log('  - Message original:', res2.error?.message);

  // Error mapping simulation as in src/app/api/auth/route.ts
  const authErrors = {
    invalid_credentials: 'invalid_credentials',
    email_not_confirmed: 'email_not_confirmed',
    user_banned: 'user_banned',
    email_address_invalid: 'invalid_email',
    email_exists: 'account_exists',
    user_already_exists: 'account_exists',
    weak_password: 'weak_password',
    over_email_send_rate_limit: 'rate_limit',
  };
  const mappedErrorCode = authErrors[res2.error?.code || ''] || 'authentication_error';
  const frontendMessagePt = translate('pt-BR', mappedErrorCode);
  const frontendMessageEn = translate('en-US', mappedErrorCode);
  const frontendMessageEs = translate('es-ES', mappedErrorCode);

  console.log('  - Código mapeado pela API:', mappedErrorCode);
  console.log('  - Mensagem frontend (pt-BR):', frontendMessagePt);
  console.log('  - Mensagem frontend (en-US):', frontendMessageEn);
  console.log('  - Mensagem frontend (es-ES):', frontendMessageEs);

  if (mappedErrorCode !== 'invalid_credentials') {
    console.error('ERRO: Mapeamento de erro incorreto! Deveria ser invalid_credentials.');
    process.exit(1);
  }
  if (frontendMessagePt.includes('recusada pelo provedor')) {
    console.error('ERRO: Mensagem no frontend ainda exibe texto antigo incorreto!');
    process.exit(1);
  }
  console.log('✔ Validação concluída com êxito: Mensagem enganosa eliminada.');

  console.log('\n=== TODOS OS TESTES PASSARAM COM SUCESSO! ===');
}

testFlow().catch(console.error);
