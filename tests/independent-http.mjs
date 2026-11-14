import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const base=new URL('https://independent.test');
const serverRoot=new URL('../dist/server/',import.meta.url),files=(await readdir(serverRoot,{recursive:true})).filter(p=>p.endsWith('.js')||p.endsWith('.mjs')),modules=await Promise.all(['index.js',...files.filter(p=>p!=='index.js')].map(async p=>({type:'ESModule',path:fileURLToPath(new URL(p,serverRoot)),contents:await readFile(new URL(p,serverRoot),'utf8')})));
let outboundCalls=0;
const mf=new Miniflare({outboundService(){outboundCalls++;return new Response('External calls disabled in this isolated test',{status:503});},modules,modulesRoot:fileURLToPath(serverRoot),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{AUTH_SECRET:'11'.repeat(32),SETUP_TOKEN:'local-fixture-only-setup-for-preview-2026',IFOOD_ENVIRONMENT:'TEST',IFOOD_PRODUCTION_ENABLED:'false'},assets:{directory:fileURLToPath(new URL('../dist/client/',import.meta.url)),routerConfig:{has_user_worker:true}}});
const DB=await mf.getD1Database('DB');
try{
 for(const f of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
const fixturePassword='Senha-ficticia-local-2026',username='qa_'+crypto.randomUUID().slice(0,8),fullName='Conferência local';
const send=async(path,{form,json,cookie,headers={}}={})=>mf.dispatchFetch(new URL(path,base),{method:form||json?'POST':'GET',redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(form||json?{Origin:base.origin,'Content-Type':json?'application/json':'application/x-www-form-urlencoded'}:{}),...headers},...(form?{body:new URLSearchParams(form)}:json?{body:JSON.stringify(json)}:{})});
assert.equal((await send('/api/house')).status,401);assert.equal((await send('/api/house',{headers:{'oai-authenticated-user-id':'preview-owner','oai-authenticated-user-email':'owner@lab.test'}})).status,401);
let setup=await send('/primeiro-acesso',{form:{setup:'local-fixture-only-setup-for-preview-2026',name:fullName,username,password:fixturePassword,repeat:fixturePassword}});
assert.equal(setup.status,303,'Run against a fresh preview database; fixture does not overwrite existing accounts.');assert.ok(setup.headers.has('set-cookie'),'The fixture must own the fresh local setup.');
const ownerCookie=setup.headers.get('set-cookie').split(';')[0];
let root=await send('/',{cookie:ownerCookie});assert.equal(root.status,200);assert.match(await root.text(),/CLOUDFLARE/);
const manifest=await send('/manifest.webmanifest',{cookie:ownerCookie});assert.equal(manifest.status,200);assert.equal((await manifest.json()).id,'/galega-cloudflare-teste');assert.equal((await send('/app-icon-192.png')).status,200);
const fresh=await send('/api/house?view=house',{cookie:ownerCookie});assert.equal(fresh.status,200);const snapshot=await fresh.json();assert.equal(snapshot.actor.realRole,'admin');assert.equal(snapshot.actor.actualName,fullName);
const name='separacao_'+crypto.randomUUID().slice(0,6);
assert.equal((await send('/acessos',{cookie:ownerCookie,form:{username:name,name:'Separação local',role:'production',password:fixturePassword}})).status,303);
const logged=await send('/entrar',{form:{username:name,password:fixturePassword}});assert.equal(logged.status,303);const prodCookie=logged.headers.get('set-cookie').split(';')[0];
const prodSnapshot=await (await send('/api/house?view=kitchen',{cookie:prodCookie})).json();assert.equal(prodSnapshot.actor.realRole,'production');assert.equal(prodSnapshot.actor.name,'Separação local');assert.equal((await send('/acessos',{cookie:prodCookie})).status,403);
const order={brand:'GALEGA',customer:'Pedido fictício Cloudflare',phone:'21999990000',modality:'TAKEOUT',timing:'NOW',date:'2026-11-12',time:'10:00',address:'',items:[{name:'Churros',quantity:50,flavors:[{name:'Doce de leite',quantity:50}],observations:''}],observations:'Conferência local sem impressão física',totalCents:3000,paid:false,leadMinutes:20};
const saved=await send('/api/house',{cookie:ownerCookie,json:{op:'save',requestId:crypto.randomUUID(),order}});assert.equal(saved.status,200);const o=await saved.json();assert.equal(o.status,'PREPARING');
const another=await (await send('/api/house?view=kitchen',{cookie:prodCookie})).json();assert.ok(another.orders.some(x=>x.id===o.id));assert.ok(another.jobs.some(j=>j.orderId===o.id&&j.kind==='PRODUCTION'&&j.state==='QUEUED'));
const separated=await send('/api/house',{cookie:prodCookie,json:{op:'separate',id:o.id,revision:o.revision,requestId:crypto.randomUUID()}});assert.equal(separated.status,200);assert.equal((await separated.json()).kitchenStage,'SEPARATED');
assert.equal((await send('/api/orders',{cookie:ownerCookie})).status,200);
const deniedEdit=await send('/api/house',{cookie:prodCookie,json:{op:'save',requestId:crypto.randomUUID(),order}});assert.equal(deniedEdit.status,403);
const logout=await send('/sair',{cookie:ownerCookie,form:{}});assert.equal(logout.status,303);assert.equal((await send('/api/house',{cookie:ownerCookie})).status,401);assert.equal((await send('/api/house?view=kitchen',{cookie:prodCookie})).status,200);
assert.equal(outboundCalls,0,'independent access and Casa must not call ChatGPT, Meta or iFood');
console.log('PASS: full local Worker/Vinext HTTP login, secure session bridge into unchanged routes, no development/spoofed identity, real role permissions, Casa creation visible in another session, automatic print job and one-tap separation, original iFood read route, independent logout; no external credentials/messages/orders');

}finally{await mf.dispose();}
