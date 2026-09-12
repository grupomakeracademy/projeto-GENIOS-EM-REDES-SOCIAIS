import { createClient } from '@supabase/supabase-js';
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server configuration missing');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const tables: Record<string, string> = {
    workspaces: 'id',
    agents: 'id',
    content_items: 'id',
    background_jobs: 'id',
    ai_model_registry: 'workspace_id,provider,model_id',
  };
  for (const [table, columns] of Object.entries(tables)) {
    const { error, status } = await db.from(table).select(columns).limit(0);
    console.log(JSON.stringify({ table, status, code: error?.code, message: error?.message }));
  }
}
void main();
