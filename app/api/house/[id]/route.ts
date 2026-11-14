import {appActor,env,houseJson,houseFailure} from "@/lib/lab-http";
import {searchHouseOrders,readHouseChat,getHouseOrder} from "@/lib/house";
import {localParts} from "@/lib/house-state";
export const dynamic="force-dynamic";
export async function GET(r:Request,context:{params:Promise<{id:string}>}){try{const a=await appActor(r,["admin","manager","attendant"]);const {id}=await context.params;return houseJson(await getHouseOrder(env.DB!,id));}catch(e){return houseFailure(e);}}
