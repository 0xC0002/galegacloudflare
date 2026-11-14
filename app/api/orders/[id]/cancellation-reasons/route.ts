import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { cancellationReasonDetails, OrderActionError } from "@/lib/ifood";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 try { const {id} = await context.params; return Response.json(await cancellationReasonDetails(env,id),{headers:{"Cache-Control":"private, no-store"}}); }
 catch (error) { return Response.json({error:error instanceof OrderActionError ? error.message : "Não foi possível consultar os motivos.",...(error instanceof OrderActionError&&error.diagnostic?{diagnostic:error.diagnostic}:{})},{status:error instanceof OrderActionError ? error.status : 503,headers:{"Cache-Control":"private, no-store"}}); }
}
