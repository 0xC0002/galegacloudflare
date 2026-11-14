export const TEST_MERCHANT = "0b6393cf-0c25-483e-8846-a6bd35044f22";
export type IntegrationEnv = {
 DB?: D1Database;
 IFOOD_CLIENT_ID?: string;
 IFOOD_CLIENT_SECRET?: string;
 IFOOD_MERCHANT_ID?: string;
 IFOOD_ENVIRONMENT?: string;
 IFOOD_PRODUCTION_ENABLED?: string;
 IFOOD_ALLOWED_MERCHANT_IDS?: string;
};
export function integrationConfig(env: IntegrationEnv = {}) {
 const environment = env.IFOOD_ENVIRONMENT?.trim().toUpperCase() || "TEST";
 if (!["TEST", "PRODUCTION"].includes(environment)) throw new Error("Ambiente iFood inválido. Use TEST ou PRODUCTION.");
 const merchantId = env.IFOOD_MERCHANT_ID?.trim() || (environment === "TEST" ? TEST_MERCHANT : "");
 const allowed = (env.IFOOD_ALLOWED_MERCHANT_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
 const merchantIds = environment === "TEST" ? [merchantId] : [...new Set(allowed)];
 if (environment === "TEST" && merchantId !== TEST_MERCHANT) throw new Error("O ambiente de teste está vinculado exclusivamente à loja de teste.");
 if (environment === "PRODUCTION") {
  if (env.IFOOD_PRODUCTION_ENABLED !== "true") throw new Error("A operação de produção ainda não foi habilitada.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(merchantId) || merchantId === TEST_MERCHANT) throw new Error("Configure a identificação da loja real autorizada.");
  if (!merchantIds.length || merchantIds.length > 10 || !merchantIds.includes(merchantId) || merchantIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || id === TEST_MERCHANT)) throw new Error("As lojas de produção precisam estar explicitamente autorizadas na configuração.");
 }
 return { environment: environment as "TEST" | "PRODUCTION", isTest: environment === "TEST", merchantId, merchantIds, clientId: env.IFOOD_CLIENT_ID?.trim(), clientSecret: env.IFOOD_CLIENT_SECRET?.trim() };
}
