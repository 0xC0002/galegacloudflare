import {operationalProfile} from './workspace-policy.ts';
import {roleLabels,type HouseRole} from './house-state.ts';

type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type StationPreference={version:1;profile:HouseRole;name:string};
const preferenceKey=(userId:string)=>`galega-lab-station-preference:${userId}`;
export function readStationPreference(storage:StorageLike,userId:string):StationPreference|null{
 try{const value=JSON.parse(storage.getItem(preferenceKey(userId))||'null');
  if(value?.version!==1||!['manager','attendant','production'].includes(value.profile)||typeof value.name!=='string'||!value.name.trim()||value.name.length>60)return null;
  return{version:1,profile:value.profile,name:value.name.trim()};
 }catch{return null;}
}
export function saveStationPreference(storage:StorageLike,userId:string,name:string,profile:HouseRole){
 if(!userId||!name.trim()||name.length>60||!['manager','attendant','production'].includes(profile))throw new Error('Confira o nome e o perfil do aparelho.');
 const value:StationPreference={version:1,name:name.trim(),profile};
 try{storage.setItem(preferenceKey(userId),JSON.stringify(value));if(storage.getItem(preferenceKey(userId))!==JSON.stringify(value))throw new Error();}
 catch{throw new Error('O navegador não permitiu salvar este aparelho. Ative o armazenamento e tente novamente.');}
}
export function initialStationPreference(input:{saved:StationPreference|null;realRole:HouseRole;role:HouseRole;queryProfile:string|null;sessionProfile:string|null;sessionName:string|null}){
 const saved=input.saved,profile=input.realRole==='admin'?(saved?.profile||operationalProfile(input.queryProfile||input.sessionProfile,'manager')):operationalProfile(null,input.role);
 const legacyName=!input.queryProfile?input.sessionName?.replace(/\s*(?:[·-]\s*)?\(?testes?\)?\s*$/i,''):null;
 return{profile,name:saved?.profile===profile?saved.name:legacyName?.trim()||roleLabels[profile]};
}
