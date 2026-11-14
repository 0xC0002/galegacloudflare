import {env,houseJson} from "@/lib/lab-http";
export const dynamic="force-dynamic";
export async function GET(){const n=await env.DB!.prepare("SELECT COUNT(*) AS n FROM house_orders").first<{n:number}>();return houseJson({environment:"TEST",ifoodConfigured:!!(env.IFOOD_CLIENT_ID&&env.IFOOD_CLIENT_SECRET),houseOrders:n?.n||0,ownerConfigured:!!env.LAB_OWNER_EMAIL});}
