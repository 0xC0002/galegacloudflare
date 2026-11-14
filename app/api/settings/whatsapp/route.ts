import {appActor,env,houseJson,houseFailure,houseInput} from '@/lib/lab-http';
import {HouseError} from '@/lib/house-state';
import {whatsappStatus,connectWhatsapp,setWhatsappEnabled,sendWhatsappSample,resolveWhatsappJob} from '@/lib/whatsapp';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{
 const actor=await appActor(r);if(actor.realRole!=='admin')throw new HouseError('Somente o proprietário pode consultar esta configuração.',403);
 return houseJson(await whatsappStatus(env,actor));
}catch(e){return houseFailure(e);}}
export async function POST(r:Request){try{
 const actor=await appActor(r),i=await houseInput(r);
 switch(i.op){
  case 'connect':return houseJson(await connectWhatsapp(env,actor,i));
  case 'enabled':return houseJson(await setWhatsappEnabled(env,actor,i.enabled));
  case 'sample':return houseJson(await sendWhatsappSample(env,actor,i));
  case 'resolve':return houseJson(await resolveWhatsappJob(env,actor,i));
  default:throw new HouseError('Ação inválida.',400);
 }
}catch(e){return houseFailure(e);}}
