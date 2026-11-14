import assert from 'node:assert/strict';
import {readCloudflareConfig,validateCloudflareTarget,checkCloudflareSource} from '../scripts/check-cloudflare.mjs';
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
assert.throws(()=>validateCloudflareTarget(config,{remote:true}));
console.log('PASS: external test cannot reuse a ChatGPT Site, production name/domain/bank, production environment, copied plaintext secrets, multiple databases, direct unprotected entry or automatic receiver; isolated PWA and all 30 protected files preserved');
