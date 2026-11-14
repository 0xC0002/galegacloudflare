import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { saveWidget } from "@/lib/ifood";
import { NegotiationError } from "@/lib/negotiations";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 const origin=request.headers.get("Origin");
 if(origin&&origin!==new URL(request.url).origin||request.headers.get("Sec-Fetch-Site")==="cross-site")return Response.json({error:"Origem não autorizada."},{status:403});
 if(!request.headers.get("Content-Type")?.startsWith("application/json"))return Response.json({error:"Formato inválido."},{status:415});
 try{const body=await request.text();if(body.length>1024)return Response.json({error:"Solicitação muito grande."},{status:413});let input;try{input=JSON.parse(body);}catch{return Response.json({error:"Configuração inválida."},{status:400});}return Response.json(await saveWidget(env,input?.widgetId),{headers:{"Cache-Control":"no-store"}});}
 catch(error){return Response.json({error:error instanceof NegotiationError?error.message:"Não foi possível salvar o Widget."},{status:error instanceof NegotiationError?error.status:503,headers:{"Cache-Control":"no-store"}});}
}
