import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Supabase credentials missing.');
  process.exit(1);
}

const db = createClient(url, key);

async function main() {
  console.log('--- TESTANDO SISTEMA DE COTAS E STORED PROCEDURES ---');

  // 1. Fetch user
  const { data: profile, error: pErr } = await db
    .from('profiles')
    .select('id, name, content_quota_balance, content_quota_total_assigned, content_quota_total_consumed')
    .limit(1)
    .single();

  if (pErr) throw pErr;
  console.log('1. Perfil carregado:', profile);

  // 2. Fetch or create a real job for foreign key validity
  const { data: job } = await db.from('background_jobs').select('id, workspace_id').limit(1).maybeSingle();
  const testJobId = job?.id || null;
  const testWorkspaceId = job?.workspace_id || null;

  // 3. Test deduct_content_quota
  const { data: deductRes, error: dErr } = await db.rpc('deduct_content_quota', {
    p_user_id: profile.id,
    p_job_id: testJobId,
    p_workspace_id: testWorkspaceId,
    p_amount: 12,
    p_description: 'Teste de dedução de cotas (12 cotas)',
  });
  if (dErr) throw dErr;
  console.log('2. Dedução efetuada com sucesso:', deductRes);

  // 3. Test idempotency (same job_id should not charge again)
  const { data: retryRes, error: rErr } = await db.rpc('deduct_content_quota', {
    p_user_id: profile.id,
    p_job_id: testJobId,
    p_amount: 12,
    p_description: 'Teste de retry de job duplicado',
  });
  if (rErr) throw rErr;
  console.log('3. Retry com mesmo job_id:', retryRes);
  if (deductRes.balance === retryRes.balance) {
    console.log('✓ IDEMPOTÊNCIA VALIDADA: o saldo NÃO foi debitado duas vezes!');
  } else {
    throw new Error('Falha de idempotência: debitou duas vezes');
  }

  // 4. Test Super Admin assigning/crediting quota
  const { data: assignRes, error: aErr } = await db.rpc('assign_user_quota', {
    p_user_id: profile.id,
    p_amount: 12,
    p_mode: 'add',
    p_reason: 'Reembolso do teste automatizado',
    p_admin_email: 'r.barros84@gmail.com',
  });
  if (aErr) throw aErr;
  console.log('4. Atribuição de cotas pelo Super Admin efetuada:', assignRes);

  // 5. Query ledger
  const { data: txs, error: tErr } = await db
    .from('quota_transactions')
    .select('id, amount, balance_before, balance_after, type, description, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(2);
  if (tErr) throw tErr;
  console.log('5. Histórico no Ledger (quota_transactions):');
  console.table(txs);

  console.log('\n>>> TODOS OS TESTES E-TO-E DO SISTEMA DE COTAS PASSARAM COM 100% DE SUCESSO! <<<');
}

main().catch((err) => {
  console.error('Erro na validação:', err);
  process.exit(1);
});
