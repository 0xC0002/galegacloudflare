import {appActor,env,houseJson,houseFailure,houseInput} from '@/lib/lab-http';
import {whatsappRecipientStatus,changeWhatsappRecipient} from '@/lib/whatsapp-recipients';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{return houseJson(await whatsappRecipientStatus(env,await appActor(r)));}catch(e){return houseFailure(e);}}
export async function POST(r:Request){try{const actor=await appActor(r);return houseJson(await changeWhatsappRecipient(env,actor,await houseInput(r)));}catch(e){return houseFailure(e);}}
