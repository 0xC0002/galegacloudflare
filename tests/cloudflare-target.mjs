import assert from 'node:assert/strict';
import {readCloudflareConfig,validateCloudflareTarget,checkCloudflareSource} from '../scripts/check-cloudflare.mjs';
import {resolveCloudflareTarget,EMPTY_DATABASE_ID} from '../scripts/cloudflare-target-state.mjs';
const config=await readCloudflareConfig();await checkCloudflareSource();
for(const c of [
 {...config,name:'galega-pedidos-producao'},
 {...config,main:'worker/index.ts'},
 {...config,vars:{...config.vars,IFOOD_ENVIRONMENT:'PRODUCTION'}},
 {...config,vars:{...config.vars,IFOOD_PRODUCTION_ENABLED:'true'}},
 {...config,vars:{...config.vars,IFOOD_CLIENT_SECRET:'never-copy'}},
 {...config,vars:{...config.vars,AUTH_SECRET:'never-commit'}},
 {...config,routes:['existing-company.example/*']},
 {...config,triggers:{crons:['* * * * *']}},
 {...config,d1_databases:[...config.d1_databases,...config.d1_databases]},
 {...config,d1_databases:[{...config.d1_databases[0],database_name:'existing-production'}]},
])assert.throws(()=>validateCloudflareTarget(c));
const empty={...config,d1_databases:[{...config.d1_databases[0],database_id:EMPTY_DATABASE_ID}]};
assert.throws(()=>validateCloudflareTarget(empty,{remote:true}));
const accountId='a'.repeat(32),databaseId='00000000-0000-4000-8000-123456789abc';
const deployed={...config,account_id:accountId,name:'galega-casa-cloudflare-teste-abc123',d1_databases:[{...config.d1_databases[0],database_name:'galega-casa-cloudflare-teste-abc123',database_id:databaseId}]};
assert.doesNotThrow(()=>validateCloudflareTarget(deployed,{remote:true}));
const original=JSON.stringify(deployed);
const recovered=resolveCloudflareTarget(deployed,accountId,null,{suffix:()=>{throw new Error('A clone must not create another target');}});
assert.equal(JSON.stringify(deployed),original);
assert.deepEqual(recovered.config,deployed);
assert.equal(recovered.target.workerName,deployed.name);
assert.equal(recovered.target.databaseName,deployed.d1_databases[0].database_name);
assert.equal(recovered.target.databaseId,databaseId);
assert.deepEqual(resolveCloudflareTarget(deployed,accountId,recovered.target),recovered);
assert.throws(()=>resolveCloudflareTarget(deployed,'b'.repeat(32)));
assert.throws(()=>resolveCloudflareTarget({...deployed,account_id:undefined},accountId));
assert.throws(()=>resolveCloudflareTarget(deployed,accountId,{...recovered.target,accountId:'b'.repeat(32)}));
assert.throws(()=>resolveCloudflareTarget(deployed,accountId,{...recovered.target,workerName:'galega-pedidos-producao'}));
assert.throws(()=>resolveCloudflareTarget(deployed,accountId,{...recovered.target,databaseId:EMPTY_DATABASE_ID}));
assert.throws(()=>resolveCloudflareTarget({...deployed,vars:{...deployed.vars,IFOOD_ENVIRONMENT:'PRODUCTION'}},accountId));
const fresh={...empty,account_id:undefined,name:'galega-casa-cloudflare-teste',d1_databases:[{...empty.d1_databases[0],database_name:'galega-casa-cloudflare-teste'}]};
const created=resolveCloudflareTarget(fresh,accountId,null,{suffix:()=> 'def456'});
assert.equal(created.config.name,'galega-casa-cloudflare-teste-def456');
assert.equal(created.config.d1_databases[0].database_id,EMPTY_DATABASE_ID);
assert.equal(fresh.name,'galega-casa-cloudflare-teste');
assert.equal(resolveCloudflareTarget(created.config,accountId,null).config.name,created.config.name);
console.log('PASS: isolated TEST deployment and 30 protected files; cloned published configuration preserves Worker/database/account without local state; fresh targets and cross-account/configuration conflicts handled without network requests');
