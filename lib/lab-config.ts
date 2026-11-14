import { TEST_MERCHANT, type IntegrationEnv } from "./ifood-config.ts";

export const LAB_PROJECT_ID = "appgprj_6aed35aa6f0081919d4a92c9502e81f9";
export const LAB_TEST_CLIENT_ID = "0772ac47-88e1-4494-80e8-201405137445";

// This deployment is a test-only copy. Reject production configuration before
// any database access or iFood request can run through the application routes.
export type LabEnv=IntegrationEnv&{LAB_OWNER_EMAIL?:string;WHATSAPP_TEST_TO?:string;WHATSAPP_CONFIG_KEY?:string};
export function testOnlyEnvironment(runtime: LabEnv = {}): LabEnv {
 const environment = runtime.IFOOD_ENVIRONMENT?.trim().toUpperCase() || "TEST";
 const merchant = runtime.IFOOD_MERCHANT_ID?.trim() || TEST_MERCHANT;
 const allowed = (runtime.IFOOD_ALLOWED_MERCHANT_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
 const clientId = runtime.IFOOD_CLIENT_ID?.trim();
 if (environment !== "TEST" || runtime.IFOOD_PRODUCTION_ENABLED?.trim().toLowerCase() === "true" || merchant !== TEST_MERCHANT || allowed.some(id => id !== TEST_MERCHANT) || clientId && clientId !== LAB_TEST_CLIENT_ID) {
  throw new Error("Este laboratório aceita somente a loja e o aplicativo de teste do iFood.");
 }
 return {
  DB: runtime.DB, LAB_OWNER_EMAIL:runtime.LAB_OWNER_EMAIL,
  ...(runtime.WHATSAPP_TEST_TO?{WHATSAPP_TEST_TO:runtime.WHATSAPP_TEST_TO}:{}),
  ...(runtime.WHATSAPP_CONFIG_KEY?{WHATSAPP_CONFIG_KEY:runtime.WHATSAPP_CONFIG_KEY}:{}),
  IFOOD_CLIENT_ID: clientId,
  IFOOD_CLIENT_SECRET: runtime.IFOOD_CLIENT_SECRET,
  IFOOD_ENVIRONMENT: "TEST",
  IFOOD_PRODUCTION_ENABLED: "false",
  IFOOD_MERCHANT_ID: TEST_MERCHANT,
  IFOOD_ALLOWED_MERCHANT_IDS: TEST_MERCHANT,
 };
}
