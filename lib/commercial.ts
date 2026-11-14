import { cashChange } from "./receipt.ts";
import type { ReceiptInfo } from "./order-state.ts";
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
export function commercialLines(receipt?:ReceiptInfo):string[] {
 if(!receipt)return ["Pagamento: consultar iFood"];
 const lines:string[]=[],methods:Record<string,string>={CASH:"Dinheiro",CREDIT:"Crédito",DEBIT:"Débito",PIX:"Pix",MEAL_VOUCHER:"Vale-refeição",FOOD_VOUCHER:"Vale-alimentação",DIGITAL_WALLET:"Carteira digital",GIFT_CARD:"Vale-presente",OTHER:"Outro"};
 if(receipt.total!==null)lines.push(`Total: ${money(receipt.total)}`);
 for(const p of receipt.payments){
  lines.push(`${p.type==="ONLINE"?"Pago online":p.type==="OFFLINE"?"Cobrar na entrega":"Conferir pagamento"}: ${methods[p.method]||p.method||"iFood"}${p.brand?` · ${p.brand}`:""}${p.amount!==null?` · ${money(p.amount)}`:""}`);
  if(p.method==="CASH"&&p.type==="OFFLINE"&&p.changeFor!==null){const change=cashChange(p);lines.push(`Dinheiro para ${money(p.changeFor)} · ${change===null?"Troco a conferir":`Troco: ${money(change)}`}`);}
 }
 if(receipt.prepaid!==null&&receipt.prepaid>0)lines.push(`Já pago: ${money(receipt.prepaid)}`);
 if(receipt.pending!==null&&receipt.pending>0)lines.push(`A cobrar: ${money(receipt.pending)}`);
 const sponsors:Record<string,string>={IFOOD:"iFood",MERCHANT:"Loja",EXTERNAL:"Parceiro",CHAIN:"Rede"};
 for(const d of receipt.discounts)lines.push(`Cupom${d.amount!==null?`: ${money(d.amount)}`:""}${d.sponsors.length?` · ${d.sponsors.map(s=>`${sponsors[s.name]||s.name}${s.amount!==null?` ${money(s.amount)}`:""}`).join(" / ")}`:" · Responsável a conferir"}`);
 if(!receipt.payments.length&&receipt.prepaid===null&&receipt.pending===null)lines.push("Pagamento: consultar iFood");
 return lines;
}
