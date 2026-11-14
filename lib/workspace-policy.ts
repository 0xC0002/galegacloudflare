import type {HouseRole} from './house-state.ts';
export const operationalRoles=['manager','attendant','production'] as const;
export const workspaceViews=(role:HouseRole)=>role==='production'?['counter','kitchen'] as const:['counter','kitchen','house'] as const;
export const canUseHouse=(role:HouseRole)=>role!=='production';
export const operationalProfile=(requested:unknown,fallback:HouseRole):HouseRole=>operationalRoles.includes(requested as typeof operationalRoles[number])?requested as HouseRole:fallback==='admin'?'manager':fallback;
// Both sources share the separation printer; records remain independent.
export const automaticPrinterView=(view:string)=>view==='kitchen';
// Kitchen printing needs the entire receipt, including delivery and payment.
export function workspaceIfoodSnapshot<T>(snapshot:T,_role:HouseRole):T{return snapshot;}
