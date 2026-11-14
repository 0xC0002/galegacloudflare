import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { actOnOrder, OrderActionError } from "@/lib/ifood";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 const origin = request.headers.get("Origin");
 if (origin && origin !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") return Response.json({error:"Origem não autorizada."},{status:403});
 if (!request.headers.get("Content-Type")?.startsWith("application/json")) return Response.json({error:"Formato inválido."},{status:415});
 try {
  const text = await request.text(); if (text.length > 2048) return Response.json({error:"Solicitação muito grande."},{status:413});
  let input; try { input = JSON.parse(text); } catch { return Response.json({error:"Solicitação inválida."},{status:400}); }
  let actor;try{actor=await appActor(request,input.action==="finishSeparation"?["admin","manager","attendant","production"]:["admin","manager","attendant","production"]);}catch(e){return houseFailure(e);}
  const {id} = await context.params;
  return Response.json(kitchenSnapshot(await actOnOrder(env,id,input,actor.userId),actor.role),{headers:{"Cache-Control":"no-store"}});
 } catch (error) {
  return Response.json({error:error instanceof OrderActionError ? error.message : "Não foi possível realizar a ação. Atualize a fila."},{status:error instanceof OrderActionError ? error.status : 503,headers:{"Cache-Control":"no-store"}});
 }
}
