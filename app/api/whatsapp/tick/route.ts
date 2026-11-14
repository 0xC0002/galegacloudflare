import {appActor,env,houseJson,houseFailure,checkHouseOrigin} from '@/lib/lab-http';
import {whatsappTick} from '@/lib/whatsapp';
export const dynamic='force-dynamic';
export async function POST(r:Request){try{
 checkHouseOrigin(r);await appActor(r,['admin','manager','attendant','production']);
 return houseJson(await whatsappTick(env));
}catch(e){return houseFailure(e);}}
