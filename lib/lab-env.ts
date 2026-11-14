import { env as runtime } from "cloudflare:workers";
import { testOnlyEnvironment } from "./lab-config";

export const env = testOnlyEnvironment(runtime);
