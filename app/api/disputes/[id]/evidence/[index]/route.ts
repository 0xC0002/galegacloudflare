import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { disputeEvidence, OrderActionError } from "@/lib/ifood";
import { NegotiationError } from "@/lib/negotiations";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string;index:string}>}) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 try {const {id,index}=await context.params;if(!/^\d{1,3}$/.test(index))return new Response("Evidência não encontrada.",{status:404});return await disputeEvidence(env,id,Number(index));}
 catch(error){const known=error instanceof NegotiationError||error instanceof OrderActionError;return new Response(known?error.message:"Não foi possível abrir a evidência.",{status:known?error.status:503,headers:{"Cache-Control":"no-store"}});}
}
