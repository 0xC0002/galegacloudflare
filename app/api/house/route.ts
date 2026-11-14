import {appActor,env,houseInput,houseJson,houseFailure} from "@/lib/lab-http";
import {houseSnapshot,houseDaySnapshot,saveHouseOrder,separateHouseOrder,advanceHousePreparation,changeHouseStatus,reopenHouseOrder,acknowledgeHouseAlert,saveHouseSettings,markHouseReceived,sendHouseMessage,markHouseChatRead} from "@/lib/house";
import {saveHouseFlavorCatalog} from "@/lib/house-flavors";
import {registerHouseStation,saveHouseMember} from "@/lib/house-auth";
import {requestHousePrint,requestHouseDayPrint,claimHousePrint,beginHousePrint,finishHousePrint,resolveHousePrint} from "@/lib/house-print";
import {localParts,HouseError} from "@/lib/house-state";
export const dynamic="force-dynamic";
export async function GET(r:Request){try{const a=await appActor(r),q=new URL(r.url).searchParams;if(q.get("view")==="kitchen-day")return houseJson(await houseDaySnapshot(env.DB!,a));return houseJson(await houseSnapshot(env.DB!,a,q.get("date")||localParts().date,q.get("view")||"house",q.get("history")==="1"));}catch(e){return houseFailure(e);}}
export async function POST(r:Request){try{const i=await houseInput(r),a=await appActor(r),DB=env.DB!;let out:unknown;switch(i.op){
case "station":out=await registerHouseStation(DB,a,i);break;
case "save":out=await saveHouseOrder(DB,a,i);break;
case "separate":out=await separateHouseOrder(DB,a,i);break;
case "advance":out=await advanceHousePreparation(DB,a,i);break;
case "flavor-catalog":out=await saveHouseFlavorCatalog(DB,a,i);break;
case "cancel":case "finish":out=await changeHouseStatus(DB,a,i,i.op);break;
case "reopen":out=await reopenHouseOrder(DB,a,i);break;
case "ack":out=await acknowledgeHouseAlert(DB,a,i);break;
case "settings":out=await saveHouseSettings(DB,a,i);break;
case "member":out=await saveHouseMember(DB,a,i,env.LAB_OWNER_EMAIL);break;
case "seen":out=await markHouseReceived(DB,a,i);break;
case "chat":out=await sendHouseMessage(DB,a,i);break;
case "chat-read":out=await markHouseChatRead(DB,a,i);break;
case "print-day":out=await requestHouseDayPrint(DB,a,i);break;
case "print-request":out=await requestHousePrint(DB,a,i);break;
case "print-claim":out=await claimHousePrint(DB,a,i.jobId);break;
case "print-begin":out=await beginHousePrint(DB,a,i);break;
case "print-result":out=await finishHousePrint(DB,a,i);break;
case "print-resolve":out=await resolveHousePrint(DB,a,i);break;
default:throw new HouseError("Ação inválida.",400);}return houseJson(out);}catch(e){return houseFailure(e);}}
