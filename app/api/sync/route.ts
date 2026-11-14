import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { synchronize } from "@/lib/ifood";
export const dynamic = "force-dynamic";
export async function POST(request:Request) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 const origin=request.headers.get("Origin");
 if(origin && origin!==new URL(request.url).origin)return Response.json({error:"Origem não autorizada."},{status:403});
 try { return Response.json(kitchenSnapshot(await synchronize(env),(await appActor(request)).role),{headers:{"Cache-Control":"no-store"}}); }
 catch { return Response.json({error:"Não foi possível consultar o iFood."},{status:503}); }
}
