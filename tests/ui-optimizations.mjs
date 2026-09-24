// Isolated UI checks of the real components; no authenticated APIs or publishing.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vitest/package.json')]}));
const { chromium }=require('@playwright/test');
const root=process.cwd(), out=path.join(os.tmpdir(),'genios-optimizations-ui');
fs.mkdirSync(out,{recursive:true});
const entry=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {Dashboard} from '@/features/dashboard/view';
import {NetworkFilter} from '@/components/network-filter';
import {Calendar} from '@/features/calendar/view';
import {ImportPreview} from '@/features/imports/preview';
import {mp4Dimensions} from '@/features/imports/video';
const app=createRoot(document.getElementById('root'));
window.renderScreen=(screen,video)=>{
 app.render(<main style={{padding:24,maxWidth:1400,margin:'auto'}}>
 {screen==='dashboard'?<><NetworkFilter available={['instagram','facebook']}/><Dashboard name="Geninhos" counts={[8,2,3,3]} recent={[]} upcoming={[]} agents={2} agentId="" runs={[]}/></>:null}
 {screen==='calendar'?<Calendar items={[{id:'published',topic:'Publicação real',status:'PUBLISHED',event_at:'2026-09-06T15:00:00Z',scheduled_at:null,content_variants:[{channel:'instagram'}]}]} upcoming={[]} summary={{published:1,scheduled:0,approved:0,review:0,draft:0,rejected:0}} distribution={{instagram:1}} timezone="America/Sao_Paulo" date="2026-09-24"/>:null}
 {screen==='video'?<ImportPreview title="Original" caption="Legenda" item={{id:'one',url:video,width:180,height:320,mime_type:'video/mp4'}}/>:null}
 </main>);
};window.mp4Dimensions=mp4Dimensions;window.renderScreen('dashboard');
`;
await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(out,'bundle.js'),format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{
 name:'fixture-navigation',setup(b){
 b.onResolve({filter:/^@\//},args=>({path:path.join(root,'src',args.path.slice(2))+(['.tsx','.ts'].find(ext=>fs.existsSync(path.join(root,'src',args.path.slice(2))+ext))||'')}));
 b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:root,loader:'js',contents:args.path.endsWith('link')?`import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children);}`:`
 import {useSyncExternalStore} from 'react';let query='';const subscribers=new Set();export const usePathname=()=>'/dashboard';export const useRouter=()=>({push:url=>{query=url.split('?')[1]||'';window.lastURL=url;subscribers.forEach(f=>f())},refresh:()=>{}});export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(f=>{subscribers.add(f);return()=>subscribers.delete(f)},()=>query,()=>''));`}));
 }}]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
 await page.addStyleTag({content:fs.readFileSync('src/app/globals.css','utf8')+fs.readFileSync(path.join(out,'bundle.css'),'utf8')});
 await page.addScriptTag({path:path.join(out,'bundle.js')});
 await page.getByText('Todas as redes',{exact:true}).first().click();
 await page.getByLabel('Instagram',{exact:true}).check();await page.getByLabel('Facebook',{exact:true}).check();
 if(!await page.locator('summary').innerText().then(t=>t==='Instagram + Facebook'))throw Error('Multi-selection failed');
 await page.getByLabel('Todas as redes',{exact:true}).check();
 if(await page.locator('summary').innerText()!=='Todas as redes')throw Error('All failed');
 await page.locator('summary').click();
 for(const theme of ['light','dark','system']){
 await page.emulateMedia({colorScheme:theme==='light'?'light':'dark'});
 await page.evaluate(theme=>{document.documentElement.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme},theme);
 const style=await page.locator('.dash-stat-icon-container').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
 if(style.background!=='rgba(0, 0, 0, 0)')throw Error('Icon background remains');
 if(await page.locator('h1').innerText()!=='Olá, Geninhos!')throw Error('Greeting');
 await page.screenshot({path:path.join(out,'dashboard-'+theme+'.png'),fullPage:true});
 }
 await page.evaluate(()=>window.renderScreen('calendar'));
 await page.getByText('Publicação real',{exact:true}).waitFor();
 if(await page.locator('.cal-content-pill').count()!==1)throw Error('Calendar content missing');
 if(!await page.locator('.cal-matrix-cell').filter({has:page.getByText('Publicação real',{exact:true})}).locator('.cal-cell-day-num').innerText().then(t=>t==='6'))throw Error('Wrong publication day');
 await page.screenshot({path:path.join(out,'calendar-dark.png'),fullPage:true});
 const video=await page.evaluate(async()=>{
 if(!MediaRecorder.isTypeSupported('video/mp4'))return null;
 const canvas=document.createElement('canvas');canvas.width=180;canvas.height=320;const ctx=canvas.getContext('2d');const stream=canvas.captureStream(10);
 const recorder=new MediaRecorder(stream,{mimeType:'video/mp4'});const parts=[];
 recorder.ondataavailable=e=>parts.push(e.data);
 const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
 for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#3b82f6':'#842bff';ctx.fillRect(0,0,180,320);await new Promise(r=>setTimeout(r,100));}
 recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
 const blob=new Blob(parts,{type:'video/mp4'});const bytes=new Uint8Array(await blob.arrayBuffer());const dims=window.mp4Dimensions(bytes);
 if(dims.width!==180||dims.height!==320)throw Error('MP4 metadata does not match real video');
 return {url:URL.createObjectURL(blob),bytes:[...bytes]};
 });
 if(!video)throw Error('Browser does not support MP4 fixture recording');
 fs.writeFileSync(path.join(out,'original-9x16.mp4'),Buffer.from(video.bytes));
 await page.evaluate(url=>window.renderScreen('video',url),video.url);
 const el=page.locator('video');await el.waitFor();
 await el.evaluate(v=>new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=reject;if(v.readyState>=1)resolve();}));
 const dims=await el.evaluate(v=>({w:v.videoWidth,h:v.videoHeight,fit:getComputedStyle(v).objectFit}));
 if(dims.w!==180||dims.h!==320||dims.fit!=='contain')throw Error('Preview altered dimensions');
 await el.evaluate(v=>v.play());await page.waitForTimeout(200);
 await page.screenshot({path:path.join(out,'video-dark.png'),fullPage:true});
 console.log(JSON.stringify({passed:true,themes:['Light','Dark','System'],video:dims,artifacts:out}));
}finally{await browser.close();}
