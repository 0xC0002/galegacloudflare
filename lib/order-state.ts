export type OrderStatus = "PLACED" | "CONFIRMED" | "PREPARING" | "READY_TO_PICKUP" | "DISPATCHED" | "CONCLUDED" | "CANCELLED";
export type KitchenStage = "WAITING" | "SEPARATING" | "SEPARATED";
export function kitchenQueues(orders:KitchenOrder[]){return{
 active:orders.filter(o=>!terminal(o)&&o.kitchenStage!=='SEPARATED'&&['CONFIRMED','PREPARING','READY_TO_PICKUP'].includes(o.status)),
 separated:orders.filter(o=>o.kitchenStage==='SEPARATED'&&!o.cancelled&&o.status!=='CANCELLED')
};}
export type RemoteAction = "confirm" | "startPreparation" | "readyToPickup" | "dispatch" | "requestCancellation";
export type OrderAction = RemoteAction | "startSeparation" | "finishSeparation";
export type Option = { name: string; quantity: number | null; unit: string; group: string; observations: string; options: Option[]; id?: string; uniqueId?: string; index?: number };
export type ReceiptInfo = {
  address: string[]; deliveryNotes: string; takeoutNotes?: string; pickupCode: string; deliveryAt: string; takeoutAt: string;
  total: number | null; prepaid: number | null; pending: number | null;
  payments: { amount: number | null; type: string; method: string; brand: string; changeFor: number | null }[];
  discounts: { amount: number | null; sponsors: { name: string; amount: number | null }[] }[];
};
export type KitchenOrder = {
 houseDayCopy?:boolean;houseDayPrint?:{at:string;revision:number;state:"SENT"|"REVIEW"|"SENDING";completion:string|null;changed:boolean}|null;source?:"HOUSE";receiptLabel?:string;phone?:string;houseRevision?:number;houseLeadMinutes?:number;housePaid?:boolean;
  merchantId: string; merchantName: string;
  id: string; displayId: string; customer: string; createdAt: string; receivedAt: string; isTest: boolean;
  cancelled: boolean; items: Option[]; observations: string; timing: string; preparationStart: string;
  category: string; orderType: string; deliveredBy: string; status: OrderStatus; statusAt: string;
  kitchenStage: KitchenStage; kitchenUpdatedAt: string | null; kitchenNeedsReview: boolean;
  pendingAction: { action: RemoteAction; status: string; requestedAt: string } | null;
  actionError: string | null;
  receipt?: ReceiptInfo;
  statusReview?: { status: "CONCLUDED" | "CANCELLED"; confirmedAt: string };
};
export const statusLabels: Record<OrderStatus, string> = {
  PLACED: "A confirmar", CONFIRMED: "Confirmado", PREPARING: "Em preparo", READY_TO_PICKUP: "Pronto para retirada",
  DISPATCHED: "Saiu para entrega", CONCLUDED: "Concluído", CANCELLED: "Cancelado",
};
export const actionLabels: Record<OrderAction, string> = {
  confirm: "Confirmar pedido", startPreparation: "Iniciar preparo", readyToPickup: "Avisar pedido pronto",
  dispatch: "Despachar pedido", requestCancellation: "Solicitar cancelamento",
  startSeparation: "Começar separação", finishSeparation: "Marcar como separado",
};
export const statusRank: Record<OrderStatus, number> = { PLACED: 0, CONFIRMED: 1, PREPARING: 2, READY_TO_PICKUP: 3, DISPATCHED: 4, CONCLUDED: 5, CANCELLED: 6 };
export function eventStatus(code: string): OrderStatus | null {
  const names: Record<string, OrderStatus> = {
    PLC: "PLACED", PLACED: "PLACED", ORDER_PLACED: "PLACED",
    CFM: "CONFIRMED", CONFIRMED: "CONFIRMED", ORDER_CONFIRMED: "CONFIRMED",
    PRS: "PREPARING", PREPARATION_STARTED: "PREPARING",
    RTP: "READY_TO_PICKUP", READY_TO_PICKUP: "READY_TO_PICKUP",
    DSP: "DISPATCHED", DISPATCHED: "DISPATCHED", ORDER_DISPATCHED: "DISPATCHED",
    CON: "CONCLUDED", CONCLUDED: "CONCLUDED", ORDER_CONCLUDED: "CONCLUDED",
    CAN: "CANCELLED", CANCELLED: "CANCELLED", ORDER_CANCELLED: "CANCELLED",
  };
  return names[code] || null;
}
export const terminal = (o: Pick<KitchenOrder, "status">) => o.status === "CONCLUDED" || o.status === "CANCELLED";
export function needsStatusReview(o: KitchenOrder, now = Date.now()) {
 if (terminal(o) || scheduledWait(o,now)) return false;
 const pendingAt=Date.parse(o.pendingAction?.requestedAt||"");
 if (Number.isFinite(pendingAt) && now-pendingAt>=120_000) return true;
 const expected=Date.parse(o.receipt?.deliveryAt||o.receipt?.takeoutAt||o.preparationStart||o.createdAt);
 return Number.isFinite(expected) && now-expected>=8*60*60_000;
}
export function primaryAction(o: KitchenOrder): RemoteAction | null {
  if (o.pendingAction || terminal(o)) return null;
  if (o.status === "PLACED") return "confirm";
  if (o.status === "CONFIRMED") return "startPreparation";
  if (o.status === "PREPARING") return "readyToPickup";
  if (o.status === "READY_TO_PICKUP" && o.orderType === "DELIVERY" && o.deliveredBy === "MERCHANT") return "dispatch";
  return null;
}
export function scheduledWait(o: KitchenOrder, now = Date.now()) {
  const start = Date.parse(o.preparationStart);
  return o.timing === "SCHEDULED" && (!Number.isFinite(start) || start > now);
}
export function preparationSignature(o: Pick<KitchenOrder, "items" | "observations" | "receipt">) {
  const item = (x: Option): unknown => [x.name, x.quantity, x.unit, x.group, x.observations, x.options.map(item)];
  return JSON.stringify([o.items.map(item), o.observations, o.receipt?.takeoutNotes || ""]);
}
export function fulfillmentLabel(o: KitchenOrder) {
  if (o.orderType === "TAKEOUT") return "Retirada na loja";
  if (o.orderType === "DINE_IN") return "Consumo na loja";
  if (o.deliveredBy === "MERCHANT") return "Entrega própria";
  if (o.deliveredBy === "IFOOD") return "Entrega iFood";
  return "Modalidade a verificar";
}
