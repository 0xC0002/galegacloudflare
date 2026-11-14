import { needsStatusReview, type KitchenOrder } from "./order-state.ts";

const CONFIRMATION_SLA_MS = 8 * 60_000;

export function confirmationQueue(orders: KitchenOrder[], now: number) {
 return orders.filter(o => o.status === "PLACED" && !o.cancelled && !needsStatusReview(o,now))
  .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function confirmationTime(order: KitchenOrder, now: number) {
 if (order.status !== "PLACED" || order.cancelled || order.pendingAction) return null;
 const created = Date.parse(order.createdAt);
 if (!Number.isFinite(created)) return null;
 const seconds = Math.max(0,Math.ceil((created + CONFIRMATION_SLA_MS - now) / 1000));
 return { expired:seconds === 0, label:seconds === 0 ? "Prazo de confirmação excedido" : `Confirmar em ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}` };
}
