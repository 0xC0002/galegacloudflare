import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile,readdir } from 'node:fs/promises';
import { integrationConfig,TEST_MERCHANT } from '../lib/ifood-config.ts';
import { normalizeOrder,synchronize,snapshot,actOnOrder } from '../lib/ifood.ts';
import { receiptText } from '../lib/receipt.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB','PROD']});
const DB=await mf.getD1Database('DB'),PROD=await mf.getD1Database('PROD');
const realMerchant='22222222-2222-4222-8222-222222222222',id='11111111-1111-4111-8111-111111111111',stamp=new Date().toISOString();
const testEnv={DB,IFOOD_CLIENT_ID:'config-fixture',IFOOD_CLIENT_SECRET:'config-private-fixture'},prodEnv={...testEnv,DB:PROD,IFOOD_ENVIRONMENT:'PRODUCTION',IFOOD_PRODUCTION_ENABLED:'true',IFOOD_MERCHANT_ID:realMerchant,IFOOD_ALLOWED_MERCHANT_IDS:realMerchant};
const raw={id,displayId:'CONFIG',isTest:true,category:'FOOD',merchant:{id:TEST_MERCHANT},createdAt:stamp,orderType:'TAKEOUT',orderTiming:'IMMEDIATE',customer:{name:'Cliente fictício'},items:[{name:'Salgados',quantity:50}],takeout:{observations:'Aguardar a retirada no balcão lateral.'}};
let events=[],details=raw;
const writes=[];
const api=async(url,init={})=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/oauth/token'))return Response.json({accessToken:'config-token-fixture',expiresIn:3600});
 if(path.endsWith('events:polling'))return events.length?Response.json(events):new Response(null,{status:204});
 if(path.endsWith('/acknowledgment'))return new Response(null,{status:202});
 if(path.endsWith('/'+id))return Response.json(details);
 if(path.endsWith('/confirm')){writes.push(path);return new Response(null,{status:202});}
 throw new Error('Unexpected API operation '+path);
};
const event=merchantId=>({id:crypto.randomUUID(),orderId:id,merchantId,fullCode:'PLACED'});
try{
 for(const database of [DB,PROD])for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await database.prepare(sql).run();
 assert.equal(integrationConfig().environment,'TEST');assert.equal(integrationConfig({IFOOD_PRODUCTION_ENABLED:'true'}).environment,'TEST');
 for(const override of [{IFOOD_ENVIRONMENT:'PROD'},{IFOOD_ENVIRONMENT:'PRODUCTION'},{...prodEnv,IFOOD_PRODUCTION_ENABLED:'false'},{...prodEnv,IFOOD_ALLOWED_MERCHANT_IDS:''},{...prodEnv,IFOOD_ALLOWED_MERCHANT_IDS:TEST_MERCHANT},{...prodEnv,IFOOD_ALLOWED_MERCHANT_IDS:realMerchant+','+TEST_MERCHANT},{...prodEnv,IFOOD_MERCHANT_ID:TEST_MERCHANT}])assert.throws(()=>integrationConfig(override));
 assert.throws(()=>normalizeOrder({...raw,isTest:false},stamp));assert.throws(()=>normalizeOrder({...raw,merchant:{id:realMerchant}},stamp));
 assert.throws(()=>normalizeOrder(raw,stamp,prodEnv));assert.throws(()=>normalizeOrder({...raw,isTest:false},stamp,prodEnv));
 console.log('PASS: test is the default; production requires explicit activation and an explicit list of authorized real merchants; mismatched orders are rejected');
 events=[event(TEST_MERCHANT)];await synchronize(testEnv,api);assert.equal((await snapshot(testEnv)).orders[0].isTest,true);assert.equal((await snapshot(testEnv)).environment,'TEST');
 await assert.rejects(snapshot({...prodEnv,DB}),/banco exclusivo/);await assert.rejects(synchronize({...prodEnv,DB},api),/banco exclusivo/);
 assert.equal((await snapshot(testEnv)).orders.length,1,'production configuration must not erase or modify the test database');
 console.log('PASS: a database with test orders cannot be reused for production; test history is preserved');
 details={...raw,isTest:false,merchant:{id:realMerchant}};events=[event(realMerchant)];
 await synchronize(prodEnv,api);let o=(await snapshot(prodEnv)).orders[0];
 assert.equal(o.isTest,false);assert.equal((await snapshot(prodEnv)).environment,'PRODUCTION');assert.equal((await PROD.prepare('SELECT merchant_id FROM received_orders WHERE id=?').bind(id).first()).merchant_id,realMerchant);
 assert.equal(o.receipt.takeoutNotes,raw.takeout.observations);assert.ok(receiptText(o).includes('OBS RETIRADA:'));assert.ok(!receiptText(o).includes('TESTE - NAO ENTREGAR'));
 await actOnOrder(prodEnv,id,{action:'confirm',requestId:crypto.randomUUID()},'fixture-owner',api);assert.equal(writes.length,1);
 assert.equal((await snapshot(prodEnv)).orders[0].pendingAction.status,'ACCEPTED');
 assert.equal((await snapshot(testEnv)).orders[0].isTest,true);assert.equal((await snapshot(testEnv)).orders[0].pendingAction,null);
 await assert.rejects(snapshot({...testEnv,DB:PROD}),/banco exclusivo/);
 const orphanId=crypto.randomUUID();await PROD.prepare("INSERT INTO received_events (id,code,payload,received_at,handled) VALUES (?,'PLACED',?,?,1)").bind(orphanId,JSON.stringify({merchantId:TEST_MERCHANT}),stamp).run();
 await assert.rejects(snapshot(prodEnv),/eventos de outra loja/);await PROD.prepare('DELETE FROM received_events WHERE id=?').bind(orphanId).run();
 console.log('PASS: a separate simulated production database supports authorized orders and commands without affecting test orders; receipts preserve pickup instructions');
}finally{await mf.dispose();}
