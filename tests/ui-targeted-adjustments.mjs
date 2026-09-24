import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vitest/package.json')]}));
const {chromium,expect}=require('@playwright/test');
const root=process.cwd(),out=path.join(os.tmpdir(),'genios-targeted-adjustments');
fs.mkdirSync(out,{recursive:true});
await esbuild.build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {StorageBadge} from '@/components/storage-badge';import {QuotaBadge} from '@/components/quota-badge';
import {UniversityView} from '@/features/university/view';
const app=createRoot(document.getElementById('root'));
const video={id:'video',title:'Vídeo de treinamento',description:'Descrição completa preservada. Segunda linha do conteúdo.',video_url:'https://youtu.be/abcdefghijk',thumbnail_url:'',created_at:'2026-09-24',updated_at:'2026-09-24'};
window.renderView=(screen,admin=false,query='')=>{window.fixtureQuery=query;app.render(screen==='storage'?<header className="topbar"><StorageBadge/><QuotaBadge/></header>:<UniversityView key={String(admin)+query} initialVideos={[video]} canEdit={admin}/>)};
window.renderView('storage');`},bundle:true,outfile:path.join(out,'bundle.js'),format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^@\//},a=>({path:path.join(root,'src',a.path.slice(2))+(['.tsx','.ts'].find(ext=>fs.existsSync(path.join(root,'src',a.path.slice(2))+ext))||'')}));
 b.onResolve({filter:/^next\/(navigation|link)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:root,loader:'js',contents:a.path.endsWith('link')?`import React from 'react';export default function Link({children,...p}){return React.createElement('a',p,children)}`:`export const useSearchParams=()=>new URLSearchParams(window.fixtureQuery||'');export const useRouter=()=>({replace:()=>{},refresh:()=>{}});`}));
}}]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('https://fixture.test/**',route=>route.fulfill({body:'<!doctype html><div id="root"></div>',contentType:'text/html'}));
 await page.goto('https://fixture.test/');
 await page.evaluate(()=>{
  window.usage={usedBytes:300*1048576,quotaMB:2048,isUnlimited:false};
  window.requested=[];
  window.fetch=async url=>{window.requested.push(String(url));return new Response(JSON.stringify(String(url).includes('assets/quota')?window.usage:{balance:156}),{status:200,headers:{'Content-Type':'application/json'}})};
 });
 await page.addStyleTag({content:fs.readFileSync('src/app/globals.css','utf8')+fs.readFileSync(path.join(out,'bundle.css'),'utf8')});
 await page.addScriptTag({path:path.join(out,'bundle.js')});
 await expect(page.locator('.topbar-storage-badge')).toHaveText('300 MB de 2 GB (14,6%)');
 if(!await page.locator('.topbar-storage-badge').evaluate(el=>el.nextElementSibling.classList.contains('topbar-quota-badge')))throw Error('Storage badge placement');
 for(const [used,total,text] of [[600,2048,'600 MB de 2 GB (29,3%)'],[100,2048,'100 MB de 2 GB (4,9%)'],[100,5120,'100 MB de 5 GB (2%)']]){
  await page.evaluate(({used,total})=>{window.usage={usedBytes:used*1048576,quotaMB:total,isUnlimited:false};window.dispatchEvent(new Event('storage-updated'))},{used,total});
  await expect(page.locator('.topbar-storage-badge')).toHaveText(text);
 }
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.screenshot({path:path.join(out,`storage-${theme}.png`)});
 }
 for(const query of ['', 'new=1','edit=video']){
  await page.evaluate(q=>window.renderView('university',false,q),query);
  await expect(page.getByRole('button',{name:/Novo Vídeo|Editar Vídeo|Deletar|Salvar/})).toHaveCount(0);
  await expect(page.getByText('Vídeo de treinamento',{exact:true})).toBeVisible();
 }
 await page.evaluate(()=>window.renderView('university',false,'video=video'));
 await page.getByRole('button',{name:'Reproduzir vídeo',exact:true}).last().click();
 await expect(page.locator('iframe')).toHaveCount(1);
 await expect(page.getByText('Descrição completa preservada. Segunda linha do conteúdo.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Editar Vídeo|Deletar/})).toHaveCount(0);
 await page.screenshot({path:path.join(out,'university-readonly.png')});
 await page.evaluate(()=>window.renderView('university',true,''));
 await expect(page.getByRole('button',{name:/Novo Vídeo/})).toBeVisible();
 await page.evaluate(()=>window.renderView('university',true,'video=video'));
 await expect(page.getByRole('button',{name:/Editar Vídeo/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Deletar/})).toBeVisible();
 for(const query of ['new=1','edit=video']){
  await page.evaluate(q=>window.renderView('university',true,q),query);
  await expect(page.locator('form')).toBeVisible();
 }
 console.log(JSON.stringify({passed:true,storageRefresh:['upload','delete','quota-change'],university:['read-only','direct-url','player','super-admin-controls'],artifacts:out}));
}finally{await browser.close()}
