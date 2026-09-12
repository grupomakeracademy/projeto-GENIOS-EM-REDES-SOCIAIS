import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const origin = process.env.APP_ORIGIN!,
  url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const createdUsers: string[] = [],
  createdWorkspaces: string[] = [],
  storagePaths: string[] = [];
let passed = 0;
function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  passed++;
  console.log('PASS', message);
}
function expectData<T extends { data: unknown; error: unknown }>(r: T): T['data'] {
  assert.equal(r.error, null);
  return r.data;
}
async function user(label: string) {
  const password = randomBytes(24).toString('base64url'),
    email = `genios-test-${label}-${randomUUID()}@example.test`;
  const data = expectData(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    }),
  );
  assert.ok(data.user);
  createdUsers.push(data.user.id);
  const client = createClient(url, key, { auth: { persistSession: false } });
  expectData(await client.auth.signInWithPassword({ email, password }));
  return { id: data.user.id, client, email, password };
}
function session() {
  const jar = new Map<string, string>();
  return async (path: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${origin}/api/${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';')[0],
        i = first.indexOf('=');
      jar.set(first.slice(0, i), first.slice(i + 1));
    }
    const data = await response.json();
    return { status: response.status, data };
  };
}
async function main() {
  try {
    const a = await user('admin'),
      b = await user('other'),
      editor = await user('editor'),
      viewer = await user('viewer');
    const sa = session();
    check(
      (await sa('auth', { action: 'login', email: a.email, password: a.password })).status === 200,
      'Supabase login through application',
    );
    check((await sa('agents')).status === 403, 'Onboarding gates private data');
    const draft = {
      company: 'TEST · Company A',
      agentName: 'TEST · Genie',
      product: 'Reusable products',
      audience: 'Adults who buy reusable products',
      positioning: 'Practical products',
      goals: 'Explain products',
      communication: 'Clear and factual',
      visual: 'Clean product photography',
      channels: ['instagram', 'linkedin'],
      timezone: 'America/Sao_Paulo',
    };
    check(
      (await sa('onboarding', { draft, complete: false })).status === 200,
      'Onboarding progress persists',
    );
    const onboarding = await sa('onboarding', { draft, complete: true });
    check(onboarding.status === 200, 'Onboarding creates workspace and agent');
    const wa = onboarding.data.id;
    createdWorkspaces.push(wa);
    const wb = expectData(
      await b.client.rpc('complete_onboarding', {
        company: 'TEST · Company B',
        agent_name: 'TEST · Genie B',
        config: { audience: 'other audience', channels: ['x'] },
        tz: 'UTC',
      }),
    );
    createdWorkspaces.push(wb);
    expectData(
      await admin.from('workspace_members').insert([
        { workspace_id: wa, user_id: editor.id, role: 'EDITOR' },
        { workspace_id: wa, user_id: viewer.id, role: 'VIEWER' },
      ]),
    );
    check(
      expectData(await a.client.from('workspaces').select('id').eq('id', wb))?.length === 0,
      'Tenant A cannot read tenant B',
    );
    const agent = expectData(
      await a.client.from('agents').select('*').eq('workspace_id', wa).single(),
    );
    assert.ok(agent);
    check(
      expectData(
        await viewer.client
          .from('agents')
          .update({ name: 'forbidden' })
          .eq('id', agent.id)
          .select('id'),
      )?.length === 0,
      'Viewer cannot edit',
    );
    check(
      !!(await editor.client.from('ai_credentials').select('*')).error,
      'Editor cannot read credential table',
    );
    check(
      expectData(
        await editor.client
          .from('agents')
          .update({ name: 'TEST · Edited Genie' })
          .eq('id', agent.id)
          .select('id'),
      )?.length === 1,
      'Editor can update own agent',
    );
    const noProvider = await sa('runs', {
      agent_id: agent.id,
      channels: ['instagram'],
      image_count: 0,
      instruction: 'Test',
      idempotency_key: randomUUID(),
    });
    check(noProvider.data.error === 'provider_missing', 'No simulated AI when provider is missing');
    const item = expectData(
      await admin
        .from('content_items')
        .insert({
          workspace_id: wa,
          agent_id: agent.id,
          topic: 'TEST · Approval lifecycle',
          status: 'AWAITING_REVIEW',
        })
        .select()
        .single(),
    );
    assert.ok(item);
    const variant = expectData(
      await admin
        .from('content_variants')
        .insert({
          workspace_id: wa,
          content_id: item.id,
          channel: 'instagram',
          caption: 'TEST · Original caption',
          aspect_ratio: '4:5',
          image_prompts: ['TEST image prompt'],
        })
        .select()
        .single(),
    );
    assert.ok(variant);
    check(
      (await sa(`content/${item.id}`, { action: 'approve', version: item.version })).status === 200,
      'Content approval endpoint',
    );
    let current = (await sa(`content/${item.id}`)).data;
    check(current.status === 'APPROVED', 'Approval does not publish');
    check(
      (
        await sa(`content/${item.id}`, {
          action: 'schedule',
          version: current.version,
          scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        })
      ).status === 200,
      'Scheduling persists UTC timestamp',
    );
    current = (await sa(`content/${item.id}`)).data;
    check(current.status === 'SCHEDULED', 'Scheduled state is persisted');
    check(
      (
        await sa(`content/${item.id}`, {
          action: 'edit',
          version: current.version,
          variant_id: variant.id,
          caption: 'TEST · Revised caption',
        })
      ).status === 200,
      'Caption editing endpoint',
    );
    current = (await sa(`content/${item.id}`)).data;
    check(
      current.status === 'AWAITING_REVIEW' && current.scheduled_at === null,
      'Editing invalidates previous approval and schedule',
    );
    check(
      (await sa(`content/${item.id}`, { action: 'approve', version: 1 })).status === 409,
      'Stale version cannot overwrite new content',
    );
    const form = new FormData();
    form.set(
      'file',
      new File(['TEST · textual reference'], 'test-reference.txt', { type: 'text/plain' }),
    );
    form.set('category', 'test');
    const upload = await sa('assets', form);
    check(upload.status === 200, 'Validated upload to private storage');
    const asset = expectData(
      await admin.from('assets').select('storage_path').eq('id', upload.data.id).single(),
    );
    assert.ok(asset);
    storagePaths.push(asset.storage_path);
    check(
      expectData(await b.client.from('assets').select('id').eq('id', upload.data.id))?.length === 0,
      'Asset metadata isolated',
    );
    check(
      !!(await b.client.storage.from('brand-assets').download(asset.storage_path)).error,
      'Storage object isolated',
    );
    const queued = await sa(`content/${item.id}`, {
      action: 'regenerate_copy',
      version: current.version,
      variant_id: variant.id,
      idempotency_key: randomUUID(),
    });
    check(queued.status === 202, 'Regeneration enqueues transactionally');
    current = (await sa(`content/${item.id}`)).data;
    check(current.status === 'GENERATING', 'Regeneration locks content');
    check(
      (await sa(`content/${item.id}`, { action: 'approve', version: current.version })).status !==
        200,
      'Cannot approve while regenerating',
    );
    const claims = await Promise.all([admin.rpc('claim_job'), admin.rpc('claim_job')]);
    check(
      claims.flatMap((c) => expectData(c) || []).filter((j) => j.workspace_id === wa).length === 1,
      'Concurrent workers claim a job once',
    );
    console.log(`Integration result: ${passed} checks passed.`);
  } finally {
    if (storagePaths.length)
      expectData(await admin.storage.from('brand-assets').remove(storagePaths));
    for (const id of createdWorkspaces)
      expectData(await admin.from('workspaces').delete().eq('id', id));
    for (const id of createdUsers) expectData(await admin.auth.admin.deleteUser(id));
    console.log('Temporary test workspaces, users and files removed.');
  }
}
void main().catch((error) => {
  console.error('Integration failure:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
