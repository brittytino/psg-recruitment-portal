import express from "express";
import compression from "compression";
import morgan from "morgan";
import { createRequestHandler } from "@react-router/express";

const app = express();
app.disable("x-powered-by");

// Crucial: trust upstream reverse proxy (Nginx / Cloudflare / Load Balancers)
// This ensures req.protocol ('https') and req.hostname are accurate from X-Forwarded-* headers
app.set("trust proxy", true);

app.use(compression());

// Fallback safeguard: if running behind HTTPS or a reverse proxy, ensure forwarded headers match APP_ORIGIN
app.use((req, _res, next) => {
  if (process.env.APP_ORIGIN) {
    try {
      const parsedOrigin = new URL(process.env.APP_ORIGIN);
      if (parsedOrigin.protocol === "https:" && !req.headers["x-forwarded-proto"]) {
        req.headers["x-forwarded-proto"] = "https";
      }
      if (!req.headers["x-forwarded-host"]) {
        const hostHeader = req.headers["host"] || "";
        if (hostHeader.startsWith("localhost") || hostHeader.startsWith("127.0.0.1") || hostHeader.startsWith("0.0.0.0")) {
          req.headers["x-forwarded-host"] = parsedOrigin.host;
        }
      }
    } catch {
      // ignore URL parsing error
    }
  }
  next();
});

// Static assets
app.use(
  "/assets",
  express.static("build/client/assets", { immutable: true, maxAge: "1y" })
);
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

// React Router SSR handler
const build = await import("./build/server/index.js");
app.all(
  "*",
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV || "production",
  })
);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

const server = app.listen(port, host, () => {
  console.log(`[server] Portal server listening on http://${host}:${port} (trust proxy: enabled)`);
});

["SIGTERM", "SIGINT"].forEach((signal) => {
  process.once(signal, () => {
    server.close((err) => {
      if (err) console.error(err);
      process.exit(0);
    });
  });
});
