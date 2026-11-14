import type {HouseOrder,HouseSnapshot} from './house-state.ts';
export function applyHouseWorkspaceOrder(s:HouseSnapshot,o:HouseOrder):HouseSnapshot{
 const archived=(s.archivedOrders||[]).filter(x=>x.id!==o.id);
 if(['FINISHED','CANCELLED'].includes(o.status))archived.unshift(o);
 return{...s,orders:[...s.orders.filter(x=>x.id!==o.id),o],archivedOrders:archived};
}
export function houseWorkspaceQueues(orders:HouseOrder[],archivedOrders:HouseOrder[]=[]){
 const archive=new Map(archivedOrders.filter(o=>['FINISHED','CANCELLED'].includes(o.status)).map(o=>[o.id,o]));
 const active=orders.filter(o=>!archive.has(o.id)&&!['FINISHED','CANCELLED'].includes(o.status));
 const preparing=active.filter(o=>o.status==='PREPARING');
 const separated=[...preparing.filter(o=>o.kitchenStage==='SEPARATED'),...archive.values()].filter(o=>o.status!=='CANCELLED').sort((a,b)=>Date.parse(b.status==='FINISHED'?b.updatedAt:b.kitchenUpdatedAt||b.updatedAt)-Date.parse(a.status==='FINISHED'?a.updatedAt:a.kitchenUpdatedAt||a.updatedAt));
 return{active,waiting:preparing.filter(o=>o.kitchenStage!=='SEPARATED'),separated,archive:[...archive.values()]};
}
