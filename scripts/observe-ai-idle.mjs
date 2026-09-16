import pg from 'pg';
import {readFile} from 'node:fs/promises';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
 await db.connect();
 const start=new Date();
 const snapshot=async()=>({
  usage:(await db.query('select count(*)::int as n from usage_events')).rows[0].n,
  pending:(await db.query("select count(*)::int as n from background_jobs where status in ('PENDING','RUNNING')")).rows[0].n,
  activeSchedules:(await db.query('select count(*)::int as n from agent_schedules s join agents a on a.id=s.agent_id where s.enabled and a.active')).rows[0].n,
 });
 const before=await snapshot();
 console.log(JSON.stringify({phase:'start',timestamp:start.toISOString(),...before}));
 if(before.pending || before.activeSchedules) throw new Error('A observação requer ausência de trabalho legítimo pendente; nenhuma rotina foi alterada.');
 await new Promise(resolve=>setTimeout(resolve,120000));
 const after=await snapshot();
 const logs=await readFile(new URL('../.local-logs/ai-audit-server.out.log',import.meta.url),'utf8');
 const errors=await readFile(new URL('../.local-logs/ai-audit-server.err.log',import.meta.url),'utf8');
 console.log(JSON.stringify({phase:'end',timestamp:new Date().toISOString(),durationSeconds:Math.round((Date.now()-start.getTime())/1000),...after,usageDelta:after.usage-before.usage,providerAttempts:(logs.match(/AI_CALL/g)||[]).length,runnerStarted:logs.includes('Automatic queue and routine processing started'),runnerErrors:errors.includes('[Jobs]')}));
}finally{await db.end();}
