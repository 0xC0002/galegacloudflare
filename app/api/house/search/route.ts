import {appActor,env,houseJson,houseFailure} from "@/lib/lab-http";
import {searchHouseOrders,readHouseChat,getHouseOrder} from "@/lib/house";
import {localParts} from "@/lib/house-state";
export const dynamic="force-dynamic";
export async function GET(r:Request,context:{params:Promise<{id:string}>}){try{const a=await appActor(r,["admin","manager","attendant"]);const q=new URL(r.url).searchParams;return houseJson(await searchHouseOrders(env.DB!,a,q.get("q")||"",q.get("date")||localParts().date));}catch(e){return houseFailure(e);}}
