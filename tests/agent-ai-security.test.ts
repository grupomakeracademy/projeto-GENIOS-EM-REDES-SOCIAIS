import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { test, expect, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { usableOverride, credentialContext, type AgentAIRecord } from '@/lib/ai/agent-config';
import { encrypt } from '@/lib/security/crypto';
import { isSuperAdmin } from '@/lib/security/super-admin';
afterEach(() => vi.unstubAllEnvs());
test('only server-controlled app metadata grants super administration', () => {
  expect(isSuperAdmin({ app_metadata: {} })).toBe(false);
  expect(isSuperAdmin({ app_metadata: { role: 'ADMIN' } })).toBe(false);
  expect(isSuperAdmin({ app_metadata: { super_admin: true } })).toBe(true);
});
test('inactive, unverified, incomplete and undecryptable overrides fall back', () => {
  vi.stubEnv('CREDENTIAL_MASTER_KEY', Buffer.alloc(32, 4).toString('base64'));
  const row: AgentAIRecord = {
    purpose: 'image',
    provider: 'openai',
    model: 'gpt-image-1',
    enabled: true,
    configured_by: 'admin',
    validated_at: new Date().toISOString(),
    credential_ciphertext: encrypt('fixture-key', credentialContext('w', 'a', 'image', 'openai')),
  };
  expect(usableOverride(row, 'w', 'a')?.key).toBe('fixture-key');
  for (const change of [
    { enabled: false },
    { configured_by: null },
    { validated_at: null },
    { model: '' },
    { credential_ciphertext: 'invalid' },
  ])
    expect(usableOverride({ ...row, ...change }, 'w', 'a')).toBeNull();
  expect(usableOverride(row, 'w', 'other')).toBeNull();
});
test('database denies client writes and secret reads; restore changes only agent AI', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
    );
    for (const name of ['202609110001_foundation', '202609130002_agent_ai_admin'])
      await db.exec(
        (
          await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
        ).replace('create extension if not exists pgcrypto;', ''),
      );
    const admin = '00000000-0000-4000-8000-000000000001',
      client = '00000000-0000-4000-8000-000000000002';
    await db.query(
      "insert into auth.users(id,raw_app_meta_data) values($1,'{\"super_admin\":true}'),($2,'{}')",
      [admin, client],
    );
    const w = (
      await db.query<{ id: string }>(
        "insert into workspaces(name,created_by) values('QA',$1) returning id",
        [admin],
      )
    ).rows[0].id;
    await db.query(
      "insert into workspace_members(workspace_id,user_id,role) values($1,$2,'ADMIN'),($1,$3,'ADMIN')",
      [w, admin, client],
    );
    const a = (
      await db.query<{ id: string }>(
        'insert into agents(workspace_id,name,briefing) values($1,\'QA\',\'{"company":"Preserve"}\') returning id',
        [w],
      )
    ).rows[0].id;
    const config = [
      {
        purpose: 'text',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        credential_ciphertext: 'encrypted-fixture',
      },
    ];
    await expect(
      db.query('select save_agent_ai($1,$2,$3,$4)', [w, a, client, config]),
    ).rejects.toThrow('forbidden');
    await db.query('select save_agent_ai($1,$2,$3,$4)', [w, a, admin, config]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [client]);
    await db.exec(
      'grant usage on schema public,auth to authenticated; grant select on workspace_members to authenticated; grant select,update,insert on agents to authenticated;',
    );
    await db.exec('set role authenticated');
    await expect(db.query('select * from agent_ai_configs')).rejects.toThrow();
    await expect(
      db.query('update agents set text_settings=\'{"ai_configs":{}}\' where id=$1', [a]),
    ).rejects.toThrow('forbidden');
    await db.exec('reset role');
    await db.query('select save_agent_ai($1,$2,$3,$4)', [w, a, admin, []]);
    expect((await db.query('select * from agent_ai_configs')).rows).toHaveLength(0);
    expect(
      (
        await db.query<{ briefing: { company: string } }>(
          'select briefing from agents where id=$1',
          [a],
        )
      ).rows[0].briefing.company,
    ).toBe('Preserve');
  } finally {
    await db.close();
  }
});
