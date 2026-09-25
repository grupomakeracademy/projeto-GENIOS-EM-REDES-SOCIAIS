import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
loadEnvConfig(process.cwd());
test('routine persistence, channel selection, carousel and scheduled execution', async ({ page }) => {
  test.setTimeout(['1','schedule'].includes(process.env.RUN_LIVE_ROUTINE_TEST || '') ? 1500000 : 120000);
  page.setDefaultTimeout(20000);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  let uid: string | undefined, wid: string | undefined;
  try {
    const email = `qa-ai-${randomUUID()}@example.test`,
      password = randomBytes(24).toString('base64url');
    const user = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    expect(user.error).toBeNull();
    uid = user.data.user!.id;
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const workspace = await client.rpc('complete_onboarding', {
      company: 'QA IA',
      agent_name: 'QA Agente',
      config: { audience: 'Público QA', channels: ['instagram'] },
      tz: 'America/Sao_Paulo',
    });
    expect(workspace.error).toBeNull();
    wid = workspace.data;
    const agent = await db.from('agents').select('*').eq('workspace_id', wid).single();
    expect(agent.error).toBeNull();
    const id = agent.data!.id;
    const login = async () => {
      await page.goto('/login');
      await page.getByLabel('E-mail', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page).toHaveURL(/dashboard/, { timeout: 20000 });
    };

    // Include the persisted legacy shape that used to block unrelated saves.
    const refs = Array.from({length:110},()=>randomUUID());
    expect((await db.from('agents').update({channels:['x'],visual_settings:{reference_ids:refs}}).eq('id',id)).error).toBeNull();
    await login();
    await page.goto('/agents');
    await page.getByRole('tab',{name:'Rotina',exact:true}).click();
    await page.getByRole('checkbox',{name:'Instagram 4:5',exact:true}).check();
    await page.getByRole('checkbox',{name:'X 16:9',exact:true}).uncheck();
    await page.getByPlaceholder('Descreva a orientação persistente para os conteúdos desta rotina...').fill('Explique como organizar uma rotina de estudos com pausas saudáveis.');
    await page.getByPlaceholder('Ex.: Saiba mais, Garanta o seu, Acesse agora...').fill('Experimente organizar seus estudos hoje.');
    await expect(page.getByRole('button',{name:'Sim',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'Aumentar imagens',exact:true}).click();
    await page.getByRole('button',{name:'Sim',exact:true}).click();
    await page.getByRole('button',{name:'Diminuir imagens',exact:true}).click();
    await expect(page.getByRole('button',{name:'Sim',exact:true})).toBeDisabled();
    const save = async()=>{
      const response=page.waitForResponse(r=>r.url().endsWith('/api/agents') && r.request().postDataJSON()?.action==='schedule');
      await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
      expect((await response).status()).toBe(200);
      await expect(page.getByText('Alterações salvas.',{exact:true})).toBeVisible();
    };
    await save();
    const saved=(await db.from('agents').select('*').eq('id',id).single()).data!;
    expect(saved.visual_settings.reference_ids).toEqual(refs);
    expect(saved.routine_settings).toMatchObject({channels:['instagram'],image_count:1,is_carousel:false,destination:'feed',cta:'Experimente organizar seus estudos hoje.'});
    await page.reload();
    await page.getByRole('tab',{name:'Rotina',exact:true}).click();
    await expect(page.getByRole('checkbox',{name:'Instagram 4:5',exact:true})).toBeChecked();
    await expect(page.getByRole('checkbox',{name:'X 16:9',exact:true})).not.toBeChecked();
    if(['1','schedule'].includes(process.env.RUN_LIVE_ROUTINE_TEST || '')) {
      // The synthetic references validate preservation, then are removed from this fixture before AI.
      await db.from('agents').update({visual_settings:{},briefing:{company:'Escola QA',audience:'Pais e estudantes',segment:'Educação'},research_enabled:false}).eq('id',id);
      let manualId='';
      if(process.env.RUN_LIVE_ROUTINE_TEST!=='schedule') {
      const manualResponse=page.waitForResponse(r=>r.url().endsWith('/api/runs') && r.request().method()==='POST');
      await page.getByRole('button',{name:'Executar agora',exact:true}).click();
      const response=await manualResponse; expect(response.status()).toBe(202);
      manualId=(await response.json()).job.id;
      }
      const waitJob=async(jobId:string)=>{
        await expect.poll(async()=>{const {data}=await db.from('background_jobs').select('status,last_error').eq('id',jobId).single();return data?.status;},{timeout:600000,intervals:[3000]}).toMatch(/COMPLETED|FAILED/);
        const job=(await db.from('background_jobs').select('status,last_error,payload').eq('id',jobId).single()).data!;
        console.log('LIVE_JOB',jobId,job.status,job.last_error,job.payload.channels);
        expect(job.status,job.last_error||'generation').toBe('COMPLETED');
        const content=(await db.from('content_items').select('status,topic,strategy,content_variants(channel,content_media(prompt,generation_prompt))').eq('id',jobId).single()).data!;
        expect(content.content_variants.map((v:{channel:string})=>v.channel)).toEqual(['instagram']);
        expect(content.content_variants[0].content_media[0].generation_prompt).toBeTruthy();
        console.log('LIVE_CONTENT',JSON.stringify(content));
        return content;
      };
      if(manualId) await waitJob(manualId);
      await page.reload(); await page.getByRole('tab',{name:'Rotina',exact:true}).click();
      const {DateTime}=await import('luxon');
      const due=DateTime.now().setZone('America/Sao_Paulo').plus({minutes:2}).startOf('minute');
      await page.locator('.routine-activation-toggle').click();
      await page.getByRole('button',{name:'Limpar',exact:true}).click();
      await page.locator('.agent-weekday-chip').nth(due.weekday-1).click();
      await page.locator('.agent-modern-time-picker select').nth(0).selectOption(due.toFormat('HH'));
      await page.locator('.agent-modern-time-picker select').nth(1).selectOption(due.toFormat('mm'));
      await save();
      const sched=(await db.from('agent_schedules').select('*').eq('agent_id',id).single()).data!;
      expect(sched.enabled).toBe(true);expect(sched.requested_by).toBe(uid);expect(sched.timezone).toBe('America/Sao_Paulo');
      console.log('LIVE_SCHEDULE',sched.id,sched.next_run_at,sched.timezone);
      let scheduledId='';
      await expect.poll(async()=>{const {data}=await db.from('background_jobs').select('id').eq('workspace_id',wid!).eq('payload->>origin','routine');scheduledId=data?.[0]?.id||'';return data?.length||0;},{timeout:180000,intervals:[3000]}).toBe(1);
      const content=await waitJob(scheduledId);expect(content.status).toBe('ROUTINE');expect(content.strategy.destination).toBe('feed');
      await db.from('agent_schedules').update({enabled:false}).eq('id',sched.id);
    } else {
      await page.route('**/api/runs',async route=>{
        expect(route.request().postDataJSON()).toMatchObject({channels:['instagram'],image_count:1,is_carousel:false,destination:'feed'});
        await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({job:{id:randomUUID()}})});
      });
      const request=page.waitForRequest('**/api/runs');
      await page.getByRole('button',{name:'Executar agora',exact:true}).click(); await request;
    }
    const cid=randomUUID(),vid=randomUUID();
    expect((await db.from('content_items').insert({id:cid,workspace_id:wid,agent_id:id,topic:'Teste de prompts',status:'AWAITING_REVIEW',created_by:uid})).error).toBeNull();
    expect((await db.from('content_variants').insert({id:vid,workspace_id:wid,content_id:cid,channel:'instagram',title:'Teste',caption:'Legenda de teste',aspect_ratio:'4:5',image_prompts:['Cena 1','Cena 2']})).error).toBeNull();
    const prompts=['Prompt exato 1\nCom todas as instruções.','Prompt exato 2\nSem resumo.'];
    expect((await db.from('content_media').insert(prompts.map((prompt,position)=>({workspace_id:wid,variant_id:vid,position,storage_path:`workspace/${wid}/fixture-${position}.png`,aspect_ratio:'4:5',prompt:'Cena '+position,generation_prompt:prompt,provider:'test',model:'test'})))).error).toBeNull();
    await page.goto('/contents/'+cid);
    await page.getByRole('button',{name:'Prompt da imagem',exact:true}).click();
    await expect(page.locator('pre')).toHaveText(prompts[0]);
    await page.getByRole('button',{name:'2',exact:true}).click();
    await expect(page.locator('pre')).toHaveText(prompts[1]);
  } finally {
    if(wid) { await db.from('agent_schedules').update({enabled:false}).eq('workspace_id',wid); await db.from('workspaces').delete().eq('id',wid); }
    if(uid) await db.auth.admin.deleteUser(uid);
  }
});

