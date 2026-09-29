export interface Config {
  port: number;
  staticDir: string;
  allowedOrigins: Set<string>;
}

export function configFromEnv(): Config {
  const port = Number(Deno.env.get("PIRC_PORT") ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PIRC_PORT");
  }
  return {
    port,
    staticDir: Deno.env.get("PIRC_STATIC_DIR") ?? "../frontend/dist",
    allowedOrigins: new Set(
      (Deno.env.get("PIRC_ALLOWED_ORIGINS") ?? "").split(",").map((s) =>
        s.trim()
      ).filter(Boolean),
    ),
  };
}
