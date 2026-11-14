import type { KitchenOrder, Option } from "./order-state.ts";
export type DisputeAlternative = { id: string; type: string; maxCents: number | null; currency: string; minutes: number[]; reasons: string[] };
export type DisputedItem = { id: string; uniqueId: string; index: number | null; quantity: number | null; cents: number | null; currency: string; reason: string; parentUniqueId: string };
export type DisputeSettlement = { disputeId: string; status: string; reason: string; createdAt: string; alternative: { type: string; cents: number | null; currency: string; minutes: number | null; reason: string } | null };
export type Dispute = {
 merchantId: string;
 id: string; orderId: string; displayId: string; customer: string; parentDisputeId: string; createdAt: string; expiresAt: string;
 action: string; handshakeType: string; handshakeGroup: string; message: string; timeoutAction: string;
 acceptReasons: string[]; alternatives: DisputeAlternative[]; items: DisputedItem[]; evidenceCount: number;
 supported: boolean; settlement: DisputeSettlement | null; relatedSettlements: DisputeSettlement[];
 response: { action: string; status: string; requestedAt: string; error: string | null } | null;
};
export type DisputeReply = { requestId: string; action: "accept" | "reject" | "alternative"; reason?: string; detailReason?: string; alternativeId?: string; cents?: number; minutes?: number };
export const negotiationReasons: Record<string, string> = {
 HIGH_STORE_DEMAND:"Muitos pedidos na loja", UNKNOWN_ISSUE:"Problema não identificado", CUSTOMER_SATISFACTION:"Atendimento ao cliente",
 INVENTORY_CHECK:"Conferência dos produtos", SYSTEM_ISSUE:"Problema no sistema", WRONG_ORDER:"Pedido incorreto",
 PRODUCT_QUALITY:"Qualidade dos produtos", LATE_DELIVERY:"Atraso na entrega", CUSTOMER_REQUEST:"Solicitação do cliente",
 OPERATIONAL_ISSUES:"Problema na operação", LACK_OF_DRIVERS:"Falta de entregadores", ORDER_OUT_FOR_DELIVERY:"Pedido saiu para entrega",
 DRIVER_IS_ALREADY_AT_THE_ADDRESS:"Entregador no endereço", STORE_SYSTEM_ISSUES:"Problema no sistema da loja",
 STORE_INTERNAL_DIFFICULTIES:"Dificuldade interna na loja", OTHER_REASONS:"Outro motivo",
};
export const rejectionReasons = ["HIGH_STORE_DEMAND","UNKNOWN_ISSUE","CUSTOMER_SATISFACTION","INVENTORY_CHECK","SYSTEM_ISSUE","WRONG_ORDER","PRODUCT_QUALITY","LATE_DELIVERY","CUSTOMER_REQUEST"];
export const disputeLabels: Record<string,string> = {AFTER_DELIVERY:"Após a entrega",AFTER_DELIVERY_PARTIALLY:"Cancelamento parcial",PREPARATION_TIME:"Durante o preparo",DELAY:"Atraso na entrega"};
export const disputeActionLabels:Record<string,string>={CANCELLATION:"Cancelamento total",PARTIAL_CANCELLATION:"Cancelamento de itens",PROPOSED_AMOUNT_REFUND:"Proposta de reembolso",PROPOSED_ADDITIONAL_TIME:"Proposta de novo prazo"};
export const settlementLabels: Record<string,string> = {ACCEPTED:"Solicitação aceita",REJECTED:"Solicitação recusada",EXPIRED:"Prazo encerrado pelo iFood",ALTERNATIVE_REPLIED:"Proposta enviada"};
export const timeoutLabels: Record<string,string> = {ACCEPT_CANCELLATION:"Sem resposta, o iFood aceita o cancelamento.",REJECT_CANCELLATION:"Sem resposta, o iFood recusa o cancelamento.",VOID:"Sem resposta, não há ação automática informada."};
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const money = (cents: number, currency="BRL") => new Intl.NumberFormat("pt-BR",{style:"currency",currency:/^[A-Z]{3}$/.test(currency)?currency:"BRL"}).format(cents/100);
export function centsFromInput(value: string): number | null {
 const clean = value.trim(); if (!/^\d+(?:[,.]\d{1,2})?$/.test(clean)) return null;
 const [whole,decimal=""] = clean.replace(",",".").split("."); const result = Number(whole)*100+Number(decimal.padEnd(2,"0"));
 return Number.isSafeInteger(result) && result > 0 ? result : null;
}
export function disputeOpen(d: Dispute, now=Date.now()) { return !d.settlement && Number.isFinite(Date.parse(d.expiresAt)) && Date.parse(d.expiresAt)>now && (!d.response || d.response.status==="FAILED"); }
export function disputedItemName(item:DisputedItem,order?:KitchenOrder) {
 const flatten=(items:Option[]):Option[]=>items.flatMap(o=>[o,...flatten(o.options)]),all=flatten(order?.items||[]);
 const direct=all.find(o=>item.uniqueId&&o.uniqueId===item.uniqueId)||all.find(o=>item.id&&o.id===item.id);
 if(direct)return direct.name;
 const parent=item.parentUniqueId?all.find(o=>o.uniqueId===item.parentUniqueId):null;
 const scope=item.parentUniqueId?parent?.options||[]:order?.items||[];
 return scope.find(o=>item.index!==null&&o.index===item.index)?.name||"Item informado pelo iFood";
}
