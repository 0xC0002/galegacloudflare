import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { retryPendingEvents, OrderActionError } from "@/lib/ifood";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 const origin=request.headers.get("Origin");
 if(origin&&origin!==new URL(request.url).origin||request.headers.get("Sec-Fetch-Site")==="cross-site")return Response.json({error:"Origem não autorizada."},{status:403});
 try{return Response.json(await retryPendingEvents(env),{headers:{"Cache-Control":"no-store"}});}
 catch(error){return Response.json({error:error instanceof OrderActionError?error.message:"Não foi possível retomar as consultas."},{status:error instanceof OrderActionError?error.status:503,headers:{"Cache-Control":"no-store"}});}
}
