// Names used on the shared counter, kitchen screen and printed tickets.
const stores: Record<string, { name: string; label: string }> = {
 "a0c511e3-83b1-4054-855e-6835ac15cda5": { name: "Salgados da Galega", label: "Galega" },
 "2b436d5a-a9ba-4e8c-b8dc-3d812021c126": { name: "Salgados da Vovó", label: "Vovó" },
};
export function merchantIdentity(id: string) {
 return { id, ...(stores[id] || { name: "Loja iFood", label: "Loja iFood" }) };
}
export function merchantLabel(id?: string) {
 return id ? merchantIdentity(id).label : "Galega";
}
