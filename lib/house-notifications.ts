import {houseCancellationActive} from './house-cancellations.ts';
import type {HouseSnapshot} from './house-state.ts';
export type HouseNotificationState={initialized:boolean;seen:Set<string>};
export const createHouseNotificationState=():HouseNotificationState=>({initialized:false,seen:new Set()});
export function collectHouseNotifications(state:HouseNotificationState,s:HouseSnapshot){
 const recent=(createdAt:string)=>houseCancellationActive(createdAt,s.serverNow??Date.now());
 const cancellationIds=[...(s.cancellations||[]).filter(n=>recent(n.createdAt)).map(n=>`cancel:${n.orderId}:${n.revision}`),...s.jobs.filter(j=>j.kind==='CANCEL'&&j.state!=='VOID'&&recent(j.createdAt)).map(j=>`cancel:${j.orderId}:${j.revision}`),...s.alerts.filter(a=>a.kind==='CANCEL'&&recent(a.createdAt)).map(a=>`cancel:${a.orderId}:${a.revision}`)];
 const ordinaryIds=[...s.updates.map(x=>`o:${x.id}:${x.revision}`),...s.alerts.filter(a=>a.kind!=='CANCEL').map(a=>`a:${a.id}`),...s.jobs.filter(j=>j.kind==='PRODUCTION').map(j=>`p:${j.id}`)];
 const urgent=state.initialized&&cancellationIds.some(id=>!state.seen.has(id)),ordinary=state.initialized&&ordinaryIds.some(id=>!state.seen.has(id));
 for(const id of [...cancellationIds,...ordinaryIds])state.seen.add(id);
 state.initialized=true;return{urgent,ordinary};
}
export const hasPendingHouseCancellation=(s:HouseSnapshot|null)=>!!s&&((s.cancellations||[]).some(n=>houseCancellationActive(n.createdAt,s.serverNow??Date.now()))||s.jobs.some(j=>j.kind==='CANCEL'&&['QUEUED','LEASED','SENDING','REVIEW'].includes(j.state)&&houseCancellationActive(j.createdAt,s.serverNow??Date.now()))||s.alerts.some(a=>a.kind==='CANCEL'&&!a.ackAt&&houseCancellationActive(a.createdAt,s.serverNow??Date.now())));
