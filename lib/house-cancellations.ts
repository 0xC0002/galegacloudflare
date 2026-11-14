import type {HouseCancellation} from './house-state.ts';
export const HOUSE_CANCELLATION_TTL_MS=15*60*1000;
export const HOUSE_CANCELLATION_DISMISS_KEY='galega-lab:house-cancellations-dismissed:v1';
export function houseCancellationActive(createdAt:string,now:number){
 const at=Date.parse(createdAt);return Number.isFinite(at)&&at<=now&&now<at+HOUSE_CANCELLATION_TTL_MS;
}
export function readHouseDismissals(raw:string|null,now:number):Record<string,number>{
 try{const value=JSON.parse(raw||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return{};
  const result:Record<string,number>=Object.create(null);for(const [id,expires] of Object.entries(value))if(id.length<160&&typeof expires==='number'&&Number.isFinite(expires)&&expires>now&&expires<=now+HOUSE_CANCELLATION_TTL_MS)result[id]=expires;return result;
 }catch{return{};}
}
export const visibleHouseCancellations=(notices:HouseCancellation[],dismissed:Record<string,number>,now:number)=>notices.filter(n=>houseCancellationActive(n.createdAt,now)&&!(dismissed[n.id]>now));
