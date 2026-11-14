import {randomBytes} from 'node:crypto';
import {validateCloudflareTarget} from './check-cloudflare.mjs';

export const EMPTY_DATABASE_ID='00000000-0000-4000-8000-000000000000';
const SOURCE_COMMIT='098197301783d33d76d2a4b96e3ef60d43800cd6';

// A fresh Git checkout has no ignored .cloudflare-target.json. Reuse the
// explicitly configured test deployment; never rename its Worker or database.
// The caller must still verify the database ID/name in the authenticated account.
export function resolveCloudflareTarget(input,accountId,storedTarget=null,{suffix=()=>randomBytes(3).toString('hex')}={}) {
 validateCloudflareTarget(input);
 if(!/^[a-f0-9]{32}$/i.test(accountId||''))throw new Error('Selecione uma conta Cloudflare válida.');
 if(input.account_id&&input.account_id!==accountId)throw new Error('A configuração pertence a outra conta. Publicação interrompida.');
 const config=structuredClone(input),database=config.d1_databases[0];
 if(storedTarget){
  if(storedTarget.accountId!==accountId)throw new Error('Este teste já foi vinculado a outra conta.');
  if(storedTarget.workerName!==config.name||storedTarget.databaseName!==database.database_name)throw new Error('O destino foi alterado. Revise a cópia antes de publicar.');
  if(storedTarget.databaseId&&storedTarget.databaseId!==database.database_id)throw new Error('O banco local não corresponde ao destino registrado.');
  config.account_id=accountId;
  return {config,target:structuredClone(storedTarget)};
 }
 if(database.database_id!==EMPTY_DATABASE_ID){
  if(!input.account_id)throw new Error('Confirme account_id para reutilizar o banco existente.');
  validateCloudflareTarget(config,{remote:true});
 }else if(config.name==='galega-casa-cloudflare-teste'){
  const value=suffix();
  if(!/^[a-f0-9]{6}$/.test(value))throw new Error('Identificador de teste inválido.');
  config.name+='-'+value;database.database_name=config.name;
 }
 config.account_id=accountId;
 const target={accountId,workerName:config.name,databaseName:database.database_name,sourceCommit:SOURCE_COMMIT};
 if(database.database_id!==EMPTY_DATABASE_ID)target.databaseId=database.database_id;
 return {config,target};
}
