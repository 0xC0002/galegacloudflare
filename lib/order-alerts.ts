import { terminal, type KitchenOrder } from "./order-state.ts";

export type AlertMode = "counter" | "kitchen";
export type OrderAlertState = { initialized: boolean; seen: Set<string> };

export const createOrderAlertState = (): OrderAlertState => ({ initialized: false, seen: new Set() });

export function collectOrderArrivals(state: OrderAlertState, orders: KitchenOrder[]) {
 const incoming = orders.filter(o => !o.cancelled && !terminal(o) && o.status !== "DISPATCHED");
 const arrivals = state.initialized ? incoming.filter(o => !state.seen.has(o.id)) : [];
 for (const o of incoming) state.seen.add(o.id);
 state.initialized = true;
 return { counter: arrivals, kitchen: arrivals };
}
