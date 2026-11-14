import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { replyToDispute, OrderActionError } from "@/lib/ifood";
import { NegotiationError } from "@/lib/negotiations";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 const origin=request.headers.get("Origin");
 if(origin&&origin!==new URL(request.url).origin||request.headers.get("Sec-Fetch-Site")==="cross-site")return Response.json({error:"Origem não autorizada."},{status:403});
 if(!request.headers.get("Content-Type")?.startsWith("application/json"))return Response.json({error:"Formato inválido."},{status:415});
 try {
  const body=await request.text();if(body.length>4096)return Response.json({error:"Solicitação muito grande."},{status:413});
  let input;try{input=JSON.parse(body);}catch{return Response.json({error:"Resposta inválida."},{status:400});}
  const {id}=await context.params;
  return Response.json(await replyToDispute(env,id,input,request.headers.get("oai-authenticated-user-id")||"owner-service"),{headers:{"Cache-Control":"no-store"}});
 } catch(error){const known=error instanceof NegotiationError||error instanceof OrderActionError;return Response.json({error:known?error.message:"Falha no envio. Atualize o balcão antes de repetir."},{status:known?error.status:503,headers:{"Cache-Control":"no-store"}});}
}
