import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { snapshot } from "@/lib/ifood";
export const dynamic = "force-dynamic";
// Sites enforces owner-private access, including authorized service callers.
export async function GET(request:Request) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 try { return Response.json(kitchenSnapshot(await snapshot(env),(await appActor(request)).role),{headers:{"Cache-Control":"no-store"}}); }
 catch { return Response.json({error:"Não foi possível carregar a fila."},{status:503}); }
}
