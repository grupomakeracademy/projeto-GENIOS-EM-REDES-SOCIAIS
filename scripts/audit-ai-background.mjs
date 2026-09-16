import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  for (const [name, sql] of Object.entries({
    usage: `select to_char(u.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:00') local_hour,u.provider,u.model,u.operation,j.payload->>'origin' origin,count(*) calls from usage_events u left join background_jobs j on j.id=u.job_id where u.created_at>now()-interval '48 hours' group by 1,2,3,4,5 order by 1 desc`,
    reportedWindow: `select u.job_id,min(u.created_at) first_call,max(u.created_at) last_call,count(*) calls,j.scheduled_at,j.started_at,j.completed_at,j.attempts,j.max_attempts,j.payload->>'origin' origin from usage_events u left join background_jobs j on j.id=u.job_id where u.created_at>now()-interval '48 hours' and (u.created_at at time zone 'America/Sao_Paulo')::time between '04:00' and '11:00' group by u.job_id,j.id`,
    schedules: `select s.*,a.active from agent_schedules s join agents a on a.id=s.agent_id`,
    pending: `select id,type,status,attempts,max_attempts,scheduled_at,started_at,lease_until,last_error,payload->>'origin' origin,payload->>'agent_id' agent_id,payload->>'deleted' deleted from background_jobs where status in ('PENDING','RUNNING') order by scheduled_at`,
    triggers: `select event_object_table,trigger_name,action_statement from information_schema.triggers where trigger_schema='public'`,
    externalFunctions: `select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosrc ~* '(http_post|net.http|cron.schedule)'`,
  }))
    console.log(name, JSON.stringify((await db.query(sql)).rows));
  const cron=await db.query("select to_regclass('cron.job') as relation");
  console.log('databaseCron',JSON.stringify(cron.rows[0].relation?(await db.query('select jobid,schedule,active from cron.job')).rows:[]));
  await db.query('ROLLBACK');
} finally {
  await db.end();
}
