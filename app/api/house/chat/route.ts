import {appActor,env,houseJson,houseFailure} from "@/lib/lab-http";
import {searchHouseOrders,readHouseChat,getHouseOrder} from "@/lib/house";
import {localParts} from "@/lib/house-state";
export const dynamic="force-dynamic";
export async function GET(r:Request,context:{params:Promise<{id:string}>}){try{const a=await appActor(r,["admin","manager","attendant"]);const q=new URL(r.url).searchParams;return houseJson(await readHouseChat(env.DB!,a,q.has("before")?Number(q.get("before")):undefined,q.get("order")||undefined));}catch(e){return houseFailure(e);}}
