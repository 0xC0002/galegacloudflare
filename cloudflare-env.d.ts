declare namespace Cloudflare {
  interface Env {
    LAB_OWNER_EMAIL?: string;
    AUTH_SECRET?: string;
    SETUP_TOKEN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    IFOOD_CLIENT_ID?: string;
    IFOOD_CLIENT_SECRET?: string;
    IFOOD_MERCHANT_ID?: string;
    IFOOD_ENVIRONMENT?: string;
    IFOOD_PRODUCTION_ENABLED?: string;
    IFOOD_ALLOWED_MERCHANT_IDS?: string;
  }
}
