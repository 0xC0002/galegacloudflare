import {getChatGPTUser} from '@/app/chatgpt-auth';
import {env} from './lab-env';
import {houseActor,requireHouseRole,type HouseIdentity} from './house-auth';
import {HouseError,type HouseRole} from './house-state';
import {workspaceIfoodSnapshot} from './workspace-policy';
export {env};
export async function appActor(request:Request,roles?:HouseRole[]){if(!env.DB)throw new HouseError('Banco indisponível.',503);const identity:HouseIdentity|null=await getChatGPTUser();const a=await houseActor(env.DB,env.LAB_OWNER_EMAIL,identity,request.headers.get('X-Lab-Station'));if(roles)requireHouseRole(a,roles);return a;}

export function checkHouseOrigin(r:Request){const o=r.headers.get('Origin');if(o&&o!==new URL(r.url).origin||r.headers.get('Sec-Fetch-Site')==='cross-site')throw new HouseError('Origem não autorizada.',403);}
export async function houseInput(r:Request){checkHouseOrigin(r);if(!r.headers.get('Content-Type')?.startsWith('application/json'))throw new HouseError('Formato inválido.',415);const t=await r.text();if(t.length>40000)throw new HouseError('Pedido muito grande.',413);try{return JSON.parse(t);}catch{throw new HouseError('Solicitação inválida.',400);}}
export function houseJson(v:unknown,status=200){return Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});}
export function houseFailure(e:unknown){return houseJson({error:e instanceof HouseError?e.message:'Não foi possível concluir. Atualize e tente novamente.'},e instanceof HouseError?e.status:503);}
export async function legacyAccess(r:Request,roles:HouseRole[]=['admin','manager','attendant','production']){try{if(r.method!=='GET')checkHouseOrigin(r);await appActor(r,roles);return null;}catch(e){return houseFailure(e);}}
export const kitchenSnapshot=workspaceIfoodSnapshot;
