import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readCloudflareConfig,validateCloudflareTarget} from './check-cloudflare.mjs';
// Preserve the tested Worker bundle while removing old Vite/Wrangler internal
// metadata that newer Cloudflare CLI releases no longer accept.
export async function prepareCloudflareDeployConfig(){
 const source=validateCloudflareTarget(await readCloudflareConfig()),built=JSON.parse(await readFile(new URL('../dist/server/wrangler.json',import.meta.url),'utf8'));
 if(built.name!==source.name)throw new Error('Recompile a versão para o destino selecionado.');
 const config={...source,main:'index.js',no_bundle:true,rules:built.rules,assets:{directory:'../client'}};
 const path=new URL('../dist/server/cloudflare.wrangler.json',import.meta.url);await writeFile(path,JSON.stringify(config,null,2)+'\n');return fileURLToPath(path);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await prepareCloudflareDeployConfig();console.log('Cloudflare deployment configuration prepared.');}
