// Real HTTP/RLS checks confined to temporary test accounts and workspaces.
// No AI generation, user messages, or changes to existing workspaces.
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:3001';
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const users: string[] = [],
  workspaces: string[] = [],
  paths: string[] = [];
function session() {
  const jar = new Map<string, string>();
  return async (path: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`${origin}/api/${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [first] = c.split(';'),
        i = first.indexOf('=');
      jar.set(first.slice(0, i), first.slice(i + 1));
    }
    return { status: res.status, data: await res.json() };
  };
}
async function create(label: string) {
  const email = `support-qa-${label}-${randomUUID()}@example.test`,
    password = randomBytes(30).toString('base64url');
  const r = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_fixture: true, full_name: `QA ${label}` },
  });
  assert.equal(r.error, null);
  const id = r.data.user!.id;
  users.push(id);
  const api = session();
  assert.equal((await api('auth', { action: 'login', email, password })).status, 200);
  return { id, api };
}
async function main() {
  try {
    const a = await create('admin'),
      v = await create('viewer'),
      b = await create('other');
    const draft = {
      company: 'QA · Suporte temporário',
      agentName: 'QA Suporte',
      audience: 'Público de testes',
      product: 'Produto de testes',
      channels: ['instagram'],
      timezone: 'America/Sao_Paulo',
    };
    for (const user of [a, b]) {
      const r = await user.api('onboarding', { draft, complete: true });
      assert.equal(r.status, 200);
      workspaces.push(r.data.id);
    }
    assert.equal(
      (
        await db
          .from('workspace_members')
          .insert({ workspace_id: workspaces[0], user_id: v.id, role: 'VIEWER' })
      ).error,
      null,
    );
    let r = await v.api('support', {
      title: 'Teste de atendimento',
      category: 'erro_tecnico',
      priority: 'alta',
      message: 'Mensagem inicial para validar o suporte.',
    });
    assert.equal(r.status, 201);
    const id = r.data.id,
      mid = r.data.messageId;
    assert.equal((await b.api(`support/${id}`)).status, 404);
    assert.equal((await v.api(`support/${id}/status`, { value: 'fechado' }, 'PATCH')).status, 403);
    assert.equal(
      (await a.api(`support/${id}/messages`, { message: 'Resposta da equipe de teste.' })).status,
      201,
    );
    r = await v.api('support');
    assert.equal(r.data.items.find((t: { id: string }) => t.id === id).unread, true);
    const detail = await v.api(`support/${id}`);
    assert.equal(detail.data.ticket.status, 'respondido');
    assert.equal(detail.data.messages.length, 2);
    await v.api(`support/${id}/read`, { seen: detail.data.ticket.updated_at });
    r = await v.api('support');
    assert.equal(r.data.items.find((t: { id: string }) => t.id === id).unread, false);
    assert.equal((await a.api(`support/${id}/status`, { value: 'fechado' }, 'PATCH')).status, 200);
    assert.equal(
      (await v.api(`support/${id}/messages`, { message: 'Ainda preciso de ajuda.' })).status,
      201,
    );
    assert.equal((await v.api(`support/${id}`)).data.ticket.status, 'em_andamento');
    const file = new FormData();
    file.set('messageId', mid);
    file.set('file', new Blob(['Arquivo de teste'], { type: 'text/plain' }), 'teste.txt');
    r = await v.api(`support/${id}/attachments`, file);
    assert.equal(r.status, 201);
    const aid = r.data.id;
    const stored = await db
      .from('support_attachments')
      .select('storage_path')
      .eq('id', aid)
      .single();
    assert.equal(stored.error, null);
    paths.push(stored.data!.storage_path);
    r = await v.api(`support/attachments/${aid}`);
    assert.equal(r.status, 200);
    assert.equal((await fetch(r.data.url)).status, 200);
    assert.equal((await b.api(`support/attachments/${aid}`)).status, 404);
    const bad = new FormData();
    bad.set('messageId', mid);
    bad.set('file', new Blob(['Invalid bytes'], { type: 'image/png' }), 'fake.png');
    assert.equal((await v.api(`support/${id}/attachments`, bad)).status, 400);
    const announcement = {
      title: 'Comunicado de teste',
      category: 'outros',
      priority: 'normal',
      message: 'Comunicado privado de teste',
      target: 'individual',
      recipient: v.id,
    };
    assert.equal((await v.api('support/announcements', announcement)).status, 403);
    r = await a.api('support/announcements', announcement);
    assert.equal(r.status, 201);
    assert.equal((await v.api(`support/${r.data.id}`)).status, 200);
    assert.equal((await b.api(`support/${r.data.id}`)).status, 404);
    assert.equal((await v.api('ai/credentials/status')).status, 403);
    r = await a.api('ai/credentials/status');
    assert.equal(r.status, 200);
    assert.equal(r.data.openaiConfigured, true);
    assert.ok(Object.values(r.data).every((x) => typeof x === 'boolean'));
    r = await a.api('settings');
    assert.equal(r.data.configs.length, 4);
    const models = await a.api('models?provider=openai');
    assert.equal(models.status, 200);
    assert.ok(
      models.data.items.some((m: { capabilities: string[] }) =>
        m.capabilities.includes('embedding'),
      ),
    );
    assert.equal(
      (await a.api('settings', { action: 'models', configs: r.data.configs })).status,
      200,
    );
    console.log(
      'PASS: real support API, lifecycle, private attachments, announcements, RLS, credential status and four AI defaults.',
    );
  } finally {
    if (paths.length) {
      const r = await db.storage.from('support').remove(paths);
      assert.equal(r.error, null);
    }
    for (const id of workspaces) {
      const r = await db.from('workspaces').delete().eq('id', id);
      assert.equal(r.error, null);
    }
    for (const id of users) {
      const r = await db.auth.admin.deleteUser(id);
      assert.equal(r.error, null);
    }
    console.log('Temporary support fixtures removed.');
  }
}
main().catch((error) => {
  console.error('Support smoke failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
