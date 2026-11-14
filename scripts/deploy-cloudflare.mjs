import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {checkCloudflareSource,validateCloudflareTarget} from './check-cloudflare.mjs';
import {prepareCloudflareDeployConfig} from './prepare-cloudflare-config.mjs';
import {resolveCloudflareTarget} from './cloudflare-target-state.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),configPath=new URL('../wrangler.jsonc',import.meta.url),targetPath=new URL('../.cloudflare-target.json',import.meta.url);
const cliVersion='4.160.1',win=process.platform==='win32',npx=win?'npx.cmd':'npx';
// Node recente recusa abrir .cmd sem shell no Windows (spawn EINVAL): no Windows o comando vai pelo cmd.exe, com aspas nos argumentos que precisam.
const quoteForCmd=a=>/[\s"&|<>^()%!*]/.test(a)?'"'+a+'"':a;
function run(args,{input,show=false}={}){return new Promise((resolve,reject)=>{let output='';const options={cwd:root,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'},stdio:['pipe','pipe','pipe']};const p=win?spawn(args.map(quoteForCmd).join(' '),{...options,shell:true}):spawn(args[0],args.slice(1),options);for(const s of [p.stdout,p.stderr])s.on('data',b=>{output+=b;if(show)process.stdout.write(b);});p.on('error',reject);p.on('close',code=>code===0?resolve(output):reject(new Error(output.replace(/(Bearer\s+)[\w.-]+/g,'$1[redacted]').slice(-3000))));p.stdin.end(input||'');});}
const wrangler=(args,options)=>run([npx,'--yes',`wrangler@${cliVersion}`,...args],options);
function json(output){const match=output.match(/(?:^|\n)([\[{][\s\S]*)$/);if(!match)throw new Error('A Cloudflare retornou um formato inesperado. Nenhum destino será escolhido por suposição.');return JSON.parse(match[1].trim());}
const config=await checkCloudflareSource();let who;
try{who=json(await wrangler(['whoami','--json']));}catch{throw new Error('Conecte sua conta Cloudflare com: npx wrangler@4.160.1 login --device --browser=false --scopes account:read user:read workers:write d1:write');}
const accounts=who.accounts||who.user?.accounts||[],requested=process.env.CLOUDFLARE_ACCOUNT_ID||config.account_id;
const account=requested?accounts.find(a=>a.id===requested):accounts.length===1?accounts[0]:null;
if(!account)throw new Error('Selecione explicitamente CLOUDFLARE_ACCOUNT_ID. Contas disponíveis: '+accounts.map(a=>`${a.name} (${a.id})`).join(', '));
if(config.account_id&&config.account_id!==account.id)throw new Error('A configuração pertence a outra conta. Publicação interrompida.');
let storedTarget=null;try{storedTarget=JSON.parse(await readFile(targetPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Não foi possível ler o destino local. Confira .cloudflare-target.json antes de publicar.');}
const plan=resolveCloudflareTarget(config,account.id,storedTarget),target=plan.target;
Object.assign(config,plan.config);
await writeFile(targetPath,JSON.stringify(target,null,2)+'\n',{mode:0o600});
await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
const databases=json(await wrangler(['d1','list','--json','--config','wrangler.jsonc']));
if(config.d1_databases[0].database_id==='00000000-0000-4000-8000-000000000000'){
 if(databases.some(d=>d.name===target.databaseName))throw new Error('Há um banco com esse nome sem vínculo confirmado. Não será reutilizado automaticamente.');
 const created=await wrangler(['d1','create',target.databaseName,'--config','wrangler.jsonc']);const match=created.match(/database_id["\s:=]+([a-f0-9-]{36})/i);
 if(!match)throw new Error('Banco criado, mas o ID precisa ser conferido no resultado da Cloudflare antes de continuar.');
 config.d1_databases[0].database_id=match[1];await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
}else if(!databases.some(d=>(d.uuid||d.id)===config.d1_databases[0].database_id&&d.name===target.databaseName))throw new Error('O banco informado não corresponde ao teste.');
validateCloudflareTarget(config,{remote:true});
console.log('Aplicando o esquema somente no banco novo de teste…');
await wrangler(['d1','migrations','apply','DB','--remote','--config','wrangler.jsonc']);
console.log('Compilando a cópia independente…');
await run([process.execPath,'node_modules/vinext/dist/cli.js','build'],{show:true});
console.log('Publicando o teste com acesso fechado até configurar as credenciais…');
await prepareCloudflareDeployConfig();
const published=await wrangler(['deploy','--config','dist/server/cloudflare.wrangler.json']);
const url=published.match(/https:\/\/[-a-z0-9.]+\.workers\.dev\b/i)?.[0];if(!url)throw new Error('Publicação retornou sem URL verificável. Confira o resultado antes de repetir.');
const secrets=json(await wrangler(['secret','list','--format','json','--config','wrangler.jsonc'])),names=new Set(secrets.map(s=>s.name)),additions={};
if(!names.has('AUTH_SECRET')){
 const result=json(await wrangler(['d1','execute','DB','--remote','--config','wrangler.jsonc','--command','SELECT COUNT(*) n FROM independent_users','--json']));
 if(Number(result[0]?.results?.[0]?.n)!==0)throw new Error('Há acessos no banco sem chave confirmada. Não será feita troca automática da chave.');
 additions.AUTH_SECRET=randomBytes(32).toString('hex');
}
if(!names.has('WHATSAPP_CONFIG_KEY')){
 const result=json(await wrangler(['d1','execute','DB','--remote','--config','wrangler.jsonc','--command','SELECT COUNT(*) n FROM whatsapp_connection','--json']));
 if(Number(result[0]?.results?.[0]?.n)!==0)throw new Error('Há uma conexão Meta sem chave confirmada. A chave não será substituída.');
 additions.WHATSAPP_CONFIG_KEY=randomBytes(32).toString('hex');
}
if(!names.has('SETUP_TOKEN'))additions.SETUP_TOKEN=randomBytes(32).toString('base64url');
if(Object.keys(additions).length)await wrangler(['secret','bulk','--config','wrangler.jsonc'],{input:JSON.stringify(additions)});
if(additions.SETUP_TOKEN)await writeFile(new URL('../.cloudflare-onboarding.json',import.meta.url),JSON.stringify({url,setupUrl:url+'/primeiro-acesso',setupCode:additions.SETUP_TOKEN},null,2)+'\n',{mode:0o600});
await writeFile(targetPath,JSON.stringify({...target,databaseId:config.d1_databases[0].database_id,url},null,2)+'\n',{mode:0o600});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// O Worker recém-publicado e os segredos recém-gravados podem levar alguns segundos para valer em toda a rede da Cloudflare: tenta de novo antes de desistir e mostra o que foi respondido.
async function conferir(path,aceita,mensagem){let ultimo='sem resposta';for(let i=0;i<8;i++){try{const r=await fetch(url+path,{redirect:'manual'}),destino=r.headers.get('location');if(aceita(r.status,destino))return;ultimo='status '+r.status+(destino?', redirecionou para '+destino:'');}catch(e){ultimo='falha de conexão ('+(e.cause?.code||e.message)+')';}await sleep(5000);}throw new Error(mensagem+' ('+ultimo+'). A publicação foi feita em '+url+'. Aguarde um minuto e rode de novo; se persistir, abra o endereço no navegador.');}
await conferir('',(status,destino)=>status===303&&['/entrar','/primeiro-acesso'].includes(destino),'A URL foi publicada, mas o acesso precisa de conferência');
await conferir('/api/house',status=>status===401,'A proteção da API não passou na conferência');
console.log('Cópia Cloudflare publicada e protegida: '+url);
console.log('Laboratório ChatGPT e produção não foram alterados. O código de primeiro acesso está no arquivo privado .cloudflare-onboarding.json; não o inclua em repositórios ou pacotes.');
