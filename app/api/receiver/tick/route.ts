import {legacyAccess,appActor,houseFailure,kitchenSnapshot} from "@/lib/lab-http";
import { env } from "@/lib/lab-env";
import { backgroundTick } from "@/lib/background-receiver";
export const dynamic = "force-dynamic";
export async function POST(request:Request) {
 const denied=await legacyAccess(request,["admin","manager","attendant","production"]);if(denied)return denied;
 const origin = request.headers.get("Origin");
 if (origin && origin !== new URL(request.url).origin || request.headers.get("Sec-Fetch-Site") === "cross-site") return Response.json({error:"Origem não autorizada."},{status:403});
 try {
  const result = await backgroundTick(env);
  return Response.json(result,{status:result.ok ? 200 : 503,headers:{"Cache-Control":"private, no-store"}});
 } catch { return Response.json({error:"Receptor indisponível. Confira a configuração."},{status:503,headers:{"Cache-Control":"private, no-store"}}); }
}
