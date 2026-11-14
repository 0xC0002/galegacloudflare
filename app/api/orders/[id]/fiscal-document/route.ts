import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { invoiceCustomerDocument, OrderActionError } from "@/lib/ifood";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 if(new URL(request.url).searchParams.get("purpose")!=="invoice")return Response.json({error:"Consulta exclusiva para emissão de nota fiscal."},{status:400});
 try{const {id}=await context.params;return Response.json(await invoiceCustomerDocument(env,id),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){return Response.json({error:error instanceof OrderActionError?error.message:"Não foi possível consultar o documento."},{status:error instanceof OrderActionError?error.status:503,headers:{"Cache-Control":"private, no-store"}});}
}
