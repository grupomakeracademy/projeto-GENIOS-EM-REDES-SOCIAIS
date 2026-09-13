import {test,expect} from '@playwright/test';
import {loadEnvConfig} from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,randomBytes} from 'node:crypto';
import sharp from 'sharp';
loadEnvConfig(process.cwd());
test('filters isolate agents; calendar filters apply; support accepts three files and shows image',async({page})=>{
 test.setTimeout(180000);page.setDefaultTimeout(20000);
 const uploadErrors:string[]=[];
 page.on('response',async response=>{if(response.url().includes('/attachments')&&response.request().method()==='POST'&&!response.ok())uploadErrors.push(`${response.status()}: ${await response.text()}`);});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 let uid:string|undefined,wid:string|undefined;
 try {
  const email=`qa-multi-${randomUUID()}@example.test`,password=randomBytes(30).toString('base64url');
  const user=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Teste multiagente',test_fixture:true}});expect(user.error).toBeNull();uid=user.data.user!.id;
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
  const workspace=await client.rpc('complete_onboarding',{company:'QA multiagente',agent_name:'Marca A',config:{audience:'Público exclusivo A',channels:['instagram']},tz:'America/Sao_Paulo'});expect(workspace.error).toBeNull();wid=workspace.data;
  const a=await db.from('agents').select('id').eq('workspace_id',wid).single();expect(a.error).toBeNull();
  const b=await db.from('agents').insert({workspace_id:wid,name:'Marca B',briefing:{audience:'Público exclusivo B'},channels:['linkedin']}).select('id').single();expect(b.error).toBeNull();
  const scheduled=new Date(Date.now()+3600000).toISOString();
  const content=await db.from('content_items').insert([{workspace_id:wid,agent_id:a.data!.id,topic:'Conteúdo somente A',status:'PUBLISHED'},{workspace_id:wid,agent_id:b.data!.id,topic:'Conteúdo somente B',status:'SCHEDULED',scheduled_at:scheduled}]).select('id,agent_id');expect(content.error).toBeNull();
  expect((await db.from('content_variants').insert(content.data!.map(c=>({workspace_id:wid,content_id:c.id,channel:c.agent_id===a.data!.id?'instagram':'linkedin',aspect_ratio:'4:5',title:'Teste',caption:'Texto'})))).error).toBeNull();
  await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator('.dash-stat-number').first()).toHaveText('2');
  await page.getByRole('combobox',{name:'Agente',exact:true}).selectOption(b.data!.id);
  await expect(page.locator('.dash-stat-number').first()).toHaveText('1');await expect(page.locator('.dash-recent-list')).toContainText('Conteúdo somente B');await expect(page.locator('.dash-recent-list')).not.toContainText('Conteúdo somente A');
  await page.locator('nav').getByRole('link',{name:'Conteúdos',exact:true}).click();await expect(page).toHaveURL(new RegExp(b.data!.id));await expect(page.locator('.execution-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Kanban',exact:true}).click();await expect(page.locator('.content-workspace')).toHaveAttribute('aria-busy','false');await expect(page.locator('.execution-card')).toHaveCount(1);
  await page.goto(`/calendar?agent=${b.data!.id}`);await page.getByRole('button',{name:'Filtros',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('combobox',{name:'Rede social'}).selectOption('instagram');await page.getByRole('button',{name:'Aplicar filtros'}).click();await expect(page).toHaveURL(/network=instagram/);await expect(page.locator('.cal-screen-wrapper')).not.toContainText('Conteúdo somente B');
  await page.getByRole('button',{name:'Filtros',exact:true}).click();await page.getByRole('button',{name:'Limpar filtros'}).click();await expect(page.locator('.cal-screen-wrapper')).toContainText('Conteúdo somente B');
  await page.goto('/agents/new');await expect(page.getByRole('heading',{name:'Novo Briefing',exact:true}).first()).toBeVisible();await expect(page.getByLabel('Empresa / projeto',{exact:true})).toHaveValue('');await expect(page.getByLabel('Nome do agente',{exact:true})).toHaveValue('');
  await page.getByLabel('Empresa / projeto',{exact:true}).fill('Empresa C');
  await page.getByLabel('Nome do agente',{exact:true}).fill('Marca C');
  await page.getByRole('button',{name:'Próximo',exact:true}).click();
  for(const label of ['Produto ou serviço','Público-alvo','Posicionamento','Objetivos','Tom e instruções de comunicação','Identidade e estilo visual']){
    await page.getByLabel(label,{exact:true}).fill('Contexto exclusivo da Marca C');
    await page.getByRole('button',{name:'Próximo',exact:true}).click();
  }
  await page.getByRole('checkbox',{name:'Instagram',exact:true}).check();
  await page.getByRole('button',{name:'Próximo',exact:true}).click();
  await page.getByRole('button',{name:'Criar agente',exact:true}).click();
  await expect(page).toHaveURL(/\/agents\?agent=/,{timeout:20000});
  const cId=new URL(page.url()).searchParams.get('agent')!;
  const c=await db.from('agents').select('briefing,visual_settings').eq('id',cId).single();
  expect(c.error).toBeNull();expect(c.data!.briefing.company).toBe('Empresa C');expect(c.data!.visual_settings.reference_ids).toEqual([]);
  for(const [id,name] of [[a.data!.id,'Conta A'],[b.data!.id,'Conta B']]){
    const status=await page.evaluate(async({id,name})=>(await fetch('/api/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agent_id:id,channel:'instagram',action:'connect',account_name:name})})).status,{id,name});expect(status).toBe(200);
  }
  const own=await page.evaluate(async id=>(await fetch(`/api/channels?agent=${id}`)).json(),b.data!.id);
  expect(own.items).toHaveLength(1);expect(own.items[0].account_name).toBe('Conta B');
  const empty=await page.evaluate(async id=>(await fetch(`/api/channels?agent=${id}`)).json(),cId);expect(empty.items).toHaveLength(0);
  const forbidden=await page.evaluate(async()=> (await fetch('/api/runs?agent=00000000-0000-4000-8000-000000000001')).status);expect(forbidden).toBe(403);
  await page.goto('/support');await page.getByRole('button',{name:'Novo chamado',exact:true}).click();await page.getByRole('dialog').getByRole('combobox',{name:'Categoria',exact:true}).selectOption('outros');await page.getByLabel('Assunto',{exact:true}).fill('Anexos de teste');await page.getByLabel('Mensagem',{exact:true}).fill('Três arquivos de teste.');
  const image=await sharp({create:{width:48,height:48,channels:3,background:'#5566cc'}}).png().toBuffer();
  const files=[{name:'imagem.png',mimeType:'image/png',buffer:image},{name:'um.txt',mimeType:'text/plain',buffer:Buffer.from('Primeiro documento')},{name:'dois.txt',mimeType:'text/plain',buffer:Buffer.from('Segundo documento')}];
  await page.locator('input[type=file]').setInputFiles([...files,{name:'quatro.txt',mimeType:'text/plain',buffer:Buffer.from('Quarto')}]);await expect(page.getByText('Selecione no máximo 3 anexos por mensagem.')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(files);await page.getByRole('button',{name:'Criar chamado',exact:true}).click();await expect.poll(async()=>uploadErrors.length?uploadErrors.join(';'):await page.locator('.support-attachment').count(),{timeout:20000}).toBe(3);await expect(page.locator('.support-attachment img')).toBeVisible();await expect.poll(()=>page.locator('.support-attachment img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(48);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 } finally {
  if(wid){const attachments=await db.from('support_attachments').select('storage_path').eq('workspace_id',wid);if(attachments.data?.length)await db.storage.from('support').remove(attachments.data.map(a=>a.storage_path));expect((await db.from('workspaces').delete().eq('id',wid)).error).toBeNull();}
  if(uid)expect((await db.auth.admin.deleteUser(uid)).error).toBeNull();
 }
});
