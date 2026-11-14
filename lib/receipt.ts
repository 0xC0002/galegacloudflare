import { fulfillmentLabel, type KitchenOrder, type Option, type ReceiptInfo } from "./order-state.ts";
import {escPosQr,receiptWhatsappLink} from './receipt-qr.ts';
const WIDTH = 32;
const divider = "-".repeat(WIDTH);
function ascii(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[–—]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\x20-\x7E\n]/g,""); }
function wrap(value: string, indent = 0, columns = WIDTH): string[] {
 const prefix = " ".repeat(Math.min(indent,8)), width = columns-prefix.length, result:string[] = [];
 for (const paragraph of ascii(value).split("\n")) {
  let line = "";
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
   if (line && line.length+1+word.length>width) { result.push(prefix+line); line=""; }
   let remaining = word;
   while (remaining.length>width) { if(line){result.push(prefix+line);line="";} result.push(prefix+remaining.slice(0,width)); remaining=remaining.slice(width); }
   if(remaining) line += (line?" ":"")+remaining;
  }
  if(line)result.push(prefix+line);
 }
 return result;
}
const qty = (value: number | null) => value === null ? "?" : value.toLocaleString("pt-BR",{maximumFractionDigits:3});
const money = (value: number) => `R$ ${value.toFixed(2).replace(".",",")}`;
function date(value: string,full=false) { return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",...(full?{year:"numeric" as const}:{}),hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"}) : ""; }
function itemLines(item: Option, depth = 0): string[] {
 const unit = item.unit && item.unit.toUpperCase()!=="UN" ? ` ${item.unit}` : "x";
 return [...wrap(`${qty(item.quantity)}${unit} ${item.name}`,depth*2),...wrap(item.group?`(${item.group})`:"",depth*2+2),...wrap(item.observations?`OBS: ${item.observations}`:"",depth*2+2),...item.options.flatMap(x=>itemLines(x,depth+1))];
}
function houseItemLines(item:Option):string[]{
 if(/churro/i.test(item.name)&&item.options.length&&item.options.every(o=>!o.options.length)){
  return [...item.options.flatMap(flavor=>wrap(`${qty(flavor.quantity)}x ${item.name} de ${flavor.name}`)),...wrap(item.observations?`OBS: ${item.observations}`:'',2)];
 }
 return itemLines(item);
}
export function cashChange(payment: ReceiptInfo["payments"][number]): number | null {
 return payment.method!=="CASH"||payment.type!=="OFFLINE"||payment.amount===null||payment.changeFor===null?null:Math.max(0,Math.round(payment.changeFor*100)-Math.round(payment.amount*100))/100;
}
export function houseFreezerNotice(order:KitchenOrder):string[]{
 if(order.source!=='HOUSE'||order.cancelled||order.status==='CANCELLED')return[];
 const prior=order.houseDayPrint;
 if(!prior){if(order.houseDayCopy&&order.kitchenStage==='SEPARATED')return['PEDIDO JA MARCADO SEPARADO','CONFIRA A BANDEJA EXISTENTE','NAO SEPARAR NOVAMENTE'];return order.houseDayCopy?[`PEDIDO ${order.displayId} - NOTA DO DIA`,'SEPARAR E GUARDAR NO FREEZER']:[];}
 if(prior.changed)return['ATENCAO: PEDIDO ALTERADO','JA TEVE NOTA PARA O FREEZER','CONFIRA ITENS E QUANTIDADES'];
 if(prior.state!=='SENT')return['ATENCAO: IMPRESSAO A CONFERIR','VERIFIQUE NOTA E BANDEJA','ANTES DE SEPARAR'];
 return[prior.completion==='submitted'?'VIA DO DIA JA ENVIADA':'NOTA IMPRESSA MAIS CEDO','CONFIRA A BANDEJA DO FREEZER','NAO SEPARE EM DUPLICIDADE'];
}
export const isHouseCancellation=(order:KitchenOrder)=>order.source==='HOUSE'&&(order.cancelled||order.status==='CANCELLED');
export function houseCancellationText(order:KitchenOrder):string{
 const promised=order.receipt?.takeoutAt||order.receipt?.deliveryAt||order.createdAt;
 const time=Number.isFinite(Date.parse(promised))?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(promised)):'--:--';
 return ['CANCELAR PEDIDO DO',order.customer.toUpperCase(),'DO HORARIO',time].flatMap(line=>wrap(line,0,16)).join('\n');
}
export function houseFreezerFooter(order:KitchenOrder):string{
 if(order.source!=='HOUSE'||isHouseCancellation(order)||order.houseDayCopy||!order.houseDayPrint)return '';
 const prior=order.houseDayPrint;
 if(prior.changed)return 'PEDIDO DA CASA ALTERADO. CHECAR NO FREEZER E CONFERIR ITENS E QUANTIDADES DA NOTA ATUAL';
 if(prior.state!=='SENT')return 'IMPRESSAO DA MANHA A CONFERIR. CHECAR NOTA E BANDEJA NO FREEZER';
 if(prior.completion==='submitted')return 'NOTA DA CASA JA ENVIADA PELA MANHA. CHECAR IMPRESSAO E BANDEJA NO FREEZER';
 // Wording requested for the team's morning freezer workflow. Printing never
 // changes the persisted kitchen stage or confirms physical separation.
 return 'PEDIDO DA CASA JA SEPARADO PELA MANHA, CHECAR NO FREEZER';
}
function houseReceiptText(order:KitchenOrder):string{
 if(isHouseCancellation(order))return houseCancellationText(order);
 const lines=[...wrap((order.merchantName||'Salgados da Galega').toUpperCase()),...houseFreezerNotice(order).flatMap(line=>wrap(line))];
 if(order.cancelled||order.status==='CANCELLED')lines.push('*** PEDIDO CANCELADO ***');
 else if(order.receiptLabel==='ALTERACAO DO PEDIDO')lines.push(...wrap(order.receiptLabel));
 lines.push(divider,...wrap(order.customer));
 if(order.phone)lines.push(...wrap(`Telefone: ${order.phone}`));
 const receipt=order.receipt,takeout=order.orderType==='TAKEOUT',promised=takeout?receipt?.takeoutAt:receipt?.deliveryAt;
 lines.push(...wrap(`${takeout?'Retirada':'Entrega'}: ${order.timing==='SCHEDULED'?date(promised||'',true):'Agora'}`));
 if(receipt?.address.length)lines.push(...receipt.address.flatMap(x=>wrap(x)));
 lines.push(divider);
 for(const item of order.items)lines.push(...houseItemLines(item),'');
 if(order.observations)lines.push('OBSERVACOES',...wrap(order.observations),'');
 lines.push(divider);
 if(receipt?.total!==null&&receipt?.total!==undefined)lines.push(...wrap(`TOTAL: ${money(receipt.total)}`));
 lines.push(`PAGAMENTO: ${order.housePaid?'PAGO':'A COBRAR'}`,'','Feito com carinho,','com amor, Galega!');
 const footer=houseFreezerFooter(order);if(footer)lines.push('','!',...wrap(footer));
 return lines.join('\n');
}
export function receiptText(order: KitchenOrder): string {
 if(order.source==='HOUSE')return houseReceiptText(order);
 const lines:string[]=[...wrap((order.merchantName || "Salgados da Galega").toUpperCase()),...wrap(`IFOOD - PEDIDO #${order.displayId}`)];
 if(order.receiptLabel)lines.push(...wrap(order.receiptLabel));
 if(order.houseRevision)lines.push(`VERSAO: ${order.houseRevision}`);
 if(order.phone)lines.push(...wrap(`TEL: ${order.phone}`));
 if(order.isTest) lines.push("TESTE - NAO ENTREGAR");
 if(order.cancelled || order.status==="CANCELLED")lines.push("*** PEDIDO CANCELADO ***");
 lines.push(divider,...wrap(order.customer),...wrap(date(order.createdAt)),...wrap(fulfillmentLabel(order)));
 if(order.timing==="SCHEDULED") lines.push(...wrap(`AGENDADO - PREPARO: ${date(order.preparationStart)||"conferir horario"}`));
 lines.push(divider);
 for(const item of order.items) lines.push(...itemLines(item),"");
 if(order.observations)lines.push("OBSERVACOES",...wrap(order.observations),"");
 const receipt=order.receipt;
 if(receipt){
  if(receipt.address.length)lines.push(divider,"ENTREGA",...receipt.address.flatMap(x=>wrap(x)));
  if(receipt.deliveryNotes)lines.push(...wrap(`OBS ENTREGA: ${receipt.deliveryNotes}`));
  if(receipt.takeoutNotes)lines.push(...wrap(`OBS RETIRADA: ${receipt.takeoutNotes}`));
  if(receipt.deliveryAt && date(receipt.deliveryAt))lines.push(...wrap(`Entrega prevista: ${date(receipt.deliveryAt)}`));
  if(receipt.takeoutAt && date(receipt.takeoutAt))lines.push(...wrap(`Retirada: ${date(receipt.takeoutAt)}`));
  if(receipt.pickupCode)lines.push(...wrap(`CODIGO DE COLETA: ${receipt.pickupCode}`));
  if(receipt.total!==null || receipt.payments.length)lines.push(divider);
  if(receipt.total!==null)lines.push(...wrap(`TOTAL DO PEDIDO: ${money(receipt.total)}`));
  const methods:Record<string,string>={CASH:"Dinheiro",CREDIT:"Credito",DEBIT:"Debito",PIX:"Pix",MEAL_VOUCHER:"Vale-refeicao",FOOD_VOUCHER:"Vale-alimentacao",DIGITAL_WALLET:"Carteira digital",GIFT_CARD:"Vale-presente",OTHER:"Outro"};
  for(const payment of receipt.payments){
   const label=payment.type==="ONLINE"?"PAGO ONLINE":payment.type==="OFFLINE"?"COBRAR NA ENTREGA":"PAGAMENTO A CONFERIR";
   lines.push(...wrap(`${label}: ${methods[payment.method]||payment.method||"conferir"}${payment.brand?` / ${payment.brand}`:""}${payment.amount!==null?` - ${money(payment.amount)}`:""}`));
   if(payment.method==="CASH" && payment.type==="OFFLINE" && payment.changeFor!==null){
    lines.push(...wrap(`Dinheiro para: ${money(payment.changeFor)}`));
    const change=cashChange(payment);
    lines.push(...wrap(change===null?"Troco: conferir no iFood":`TROCO: ${money(change)}`));
   }
  }
  if(receipt.prepaid!==null && receipt.prepaid>0)lines.push(...wrap(`Ja pago: ${money(receipt.prepaid)}`));
  if(receipt.pending!==null && receipt.pending>0)lines.push(...wrap(`A COBRAR: ${money(receipt.pending)}`));
  const sponsors:Record<string,string>={IFOOD:"iFood",MERCHANT:"Loja",EXTERNAL:"Parceiro",CHAIN:"Rede"};
  for(const discount of receipt.discounts){
   lines.push(...wrap(`CUPOM${discount.amount!==null?`: ${money(discount.amount)}`:""}`));
   for(const sponsor of discount.sponsors)lines.push(...wrap(`${sponsors[sponsor.name]||sponsor.name}${sponsor.amount!==null?`: ${money(sponsor.amount)}`:""}`,2));
  }
 }
 if(!receipt?.payments.length && receipt?.prepaid==null && receipt?.pending==null) lines.push(...wrap("Pagamento: consultar iFood"));
 lines.push(divider,...wrap(`PEDIDO #${order.displayId}`),"CUPOM NAO FISCAL");
 return lines.join("\n");
}
export function escPosBytes(order: KitchenOrder): Uint8Array {
 const footer=houseFreezerFooter(order),full=receiptText(order),body=footer?full.slice(0,-('\n\n!\n'+wrap(footer).join('\n')).length):full;
 const lines=body.split("\n"), bytes:number[]=[0x1b,0x40,0x1b,0x74,0x00,0x1b,0x61,0x01,0x1b,0x45,0x01,0x1d,0x21,0x00];
 const write=(value:string)=>{for(const char of value)bytes.push(char.charCodeAt(0));};
 if(isHouseCancellation(order)){
  bytes.push(0x1d,0x21,0x12);write('\n'+houseCancellationText(order)+'\n\n');
  bytes.push(0x1d,0x21,0x00,0x1b,0x45,0x00);write('\n\n\n');return new Uint8Array(bytes);
 }
 const headerLines=order.source==='HOUSE'?1:2;
 write(lines.slice(0,headerLines).join("\n")+"\n");
 const notice=houseFreezerNotice(order).flatMap(line=>wrap(line));
 if(notice.length){bytes.push(0x1b,0x45,0x01,0x1d,0x21,0x01);write(notice.join('\n')+'\n');bytes.push(0x1d,0x21,0x00);}
 bytes.push(0x1b,0x45,0x00,0x1b,0x61,0x00);write(lines.slice(headerLines+notice.length).join("\n")+"\n");
 const whatsapp=receiptWhatsappLink(order);if(whatsapp){bytes.push(0x1b,0x61,0x01);write('\nWHATSAPP DO CLIENTE\n');bytes.push(...escPosQr(whatsapp));}
 if(footer){
  bytes.push(0x1b,0x61,0x01,0x1b,0x45,0x01,0x1d,0x21,0x77);write('\n!\n');
  bytes.push(0x1d,0x21,0x11);write(wrap(footer,0,16).join('\n')+'\n');
  bytes.push(0x1d,0x21,0x00,0x1b,0x45,0x00,0x1b,0x61,0x00);
 }
 write("\n\n\n");
 return new Uint8Array(bytes);
}
export function rawBtUri(order: KitchenOrder): string {
 const bytes=escPosBytes(order);let text="";
 for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return `rawbt:base64,${btoa(text)}`;
}
