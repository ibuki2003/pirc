import { configFromEnv } from "./config.ts";
import { Registry } from "./core/registry.ts";
import { router } from "./http/router.ts";

if (import.meta.main) {
  const config = configFromEnv();
  Deno.serve({ port: config.port }, router(new Registry(), config));
}
