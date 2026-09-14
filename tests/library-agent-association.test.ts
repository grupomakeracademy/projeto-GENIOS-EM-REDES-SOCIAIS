import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';

describe('Library asset association with multiple agents and cross-workspace', () => {
  it('allows associating asset to multiple agents and updates reference_ids in visual_settings', async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
      );

      for (const name of [
        '202609110001_foundation',
        '202609110002_content',
        '202609110003_jobs',
        '202609110009_support',
        '202609120001_agent_isolation',
        '202609140001_fix_asset_agents',
      ]) {
        await db.exec(
          (
            await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
          ).replace('create extension if not exists pgcrypto;', ''),
        );
      }

      // Create users
      const user1 = '00000000-0000-4000-8000-000000000001';
      const superAdmin = '00000000-0000-4000-8000-000000000099';
      await db.query("insert into auth.users(id, email) values($1, 'user1@example.com')", [user1]);
      await db.query(
        "insert into auth.users(id, email, raw_app_meta_data) values($1, 'r.barros84@gmail.com', '{\"super_admin\":true}')",
        [superAdmin],
      );

      // Workspaces
      const w1 = (
        await db.query<{ id: string }>(
          "insert into workspaces(name, created_by) values('WS 1', $1) returning id",
          [user1],
        )
      ).rows[0].id;
      const w2 = (
        await db.query<{ id: string }>(
          "insert into workspaces(name, created_by) values('WS 2', $1) returning id",
          [superAdmin],
        )
      ).rows[0].id;

      // Membership: user1 is ADMIN in w1
      await db.query(
        "insert into workspace_members(workspace_id, user_id, role) values($1, $2, 'ADMIN')",
        [w1, user1],
      );
      await db.query(
        "insert into workspace_members(workspace_id, user_id, role) values($1, $2, 'ADMIN')",
        [w2, superAdmin],
      );

      // Agents in w1
      const agentA = (
        await db.query<{ id: string }>(
          "insert into agents(workspace_id, name, visual_settings) values($1, 'Agente A', '{\"reference_ids\":[]}') returning id",
          [w1],
        )
      ).rows[0].id;
      const agentB = (
        await db.query<{ id: string }>(
          "insert into agents(workspace_id, name, visual_settings) values($1, 'Agente B', '{\"reference_ids\":[]}') returning id",
          [w1],
        )
      ).rows[0].id;

      // Agent in w2
      const agentC = (
        await db.query<{ id: string }>(
          "insert into agents(workspace_id, name, visual_settings) values($1, 'Agente C (Outro WS)', '{\"reference_ids\":[]}') returning id",
          [w2],
        )
      ).rows[0].id;

      // Asset in w1
      const asset1 = (
        await db.query<{ id: string }>(
          "insert into assets(workspace_id, name, mime_type, storage_path, size) values($1, 'Logo.png', 'image/png', 'path/logo.png', 100) returning id",
          [w1],
        )
      ).rows[0].id;

      // Test 1: Associate asset1 with BOTH agentA and agentB simultaneously (User1)
      await db.query('select set_asset_agents($1, $2, $3, $4)', [w1, user1, asset1, [agentA, agentB]]);

      const resA1 = (
        await db.query<{ visual_settings: { reference_ids: string[] } }>(
          'select visual_settings from agents where id = $1',
          [agentA],
        )
      ).rows[0].visual_settings;
      const resB1 = (
        await db.query<{ visual_settings: { reference_ids: string[] } }>(
          'select visual_settings from agents where id = $1',
          [agentB],
        )
      ).rows[0].visual_settings;

      expect(resA1.reference_ids).toContain(asset1);
      expect(resB1.reference_ids).toContain(asset1);

      // Test 2: Deselect agentA, keep agentB
      await db.query('select set_asset_agents($1, $2, $3, $4)', [w1, user1, asset1, [agentB]]);

      const resA2 = (
        await db.query<{ visual_settings: { reference_ids: string[] } }>(
          'select visual_settings from agents where id = $1',
          [agentA],
        )
      ).rows[0].visual_settings;
      const resB2 = (
        await db.query<{ visual_settings: { reference_ids: string[] } }>(
          'select visual_settings from agents where id = $1',
          [agentB],
        )
      ).rows[0].visual_settings;

      expect(resA2.reference_ids || []).not.toContain(asset1);
      expect(resB2.reference_ids).toContain(asset1);

      // Test 3: Super Admin associating asset1 with agentB and agentC (cross-workspace)
      await db.query('select set_asset_agents($1, $2, $3, $4)', [w1, superAdmin, asset1, [agentB, agentC]]);

      const resC3 = (
        await db.query<{ visual_settings: { reference_ids: string[] } }>(
          'select visual_settings from agents where id = $1',
          [agentC],
        )
      ).rows[0].visual_settings;
      const resB3 = (
        await db.query<{ visual_settings: { reference_ids: string[] } }>(
          'select visual_settings from agents where id = $1',
          [agentB],
        )
      ).rows[0].visual_settings;

      expect(resB3.reference_ids).toContain(asset1);
      expect(resC3.reference_ids).toContain(asset1);

      // Test 4: Unauthorized user fails
      const outsider = '00000000-0000-4000-8000-000000000007';
      await db.query("insert into auth.users(id, email) values($1, 'outsider@example.com')", [outsider]);
      await expect(
        db.query('select set_asset_agents($1, $2, $3, $4)', [w1, outsider, asset1, [agentA]]),
      ).rejects.toThrow('forbidden');
    } finally {
      await db.close();
    }
  });
});
