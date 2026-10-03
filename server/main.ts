import { configFromEnv } from "./config.ts";
import { Registry } from "./core/registry.ts";
import { createPircServer } from "./ws/server.ts";

if (import.meta.main) {
  const config = configFromEnv();
  createPircServer(new Registry(), config).listen(config.port);
}
