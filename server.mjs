/**
 * PSG College of Technology — Staff & Faculty Recruitment Portal: production HTTP server.
 * Copyright (c) 2026 Tino Britty J and contributors. MIT License (see LICENSE).
 */

import express from "express";
import compression from "compression";
import morgan from "morgan";
import { createRequestHandler } from "@react-router/express";

const app = express();
app.disable("x-powered-by");

// Credits header (visible in browser DevTools → Network).
app.use((_req, res, next) => {
  res.setHeader("X-Engineered-By", "Tino Britty J (@brittytino)");
  next();
});

// Crucial: trust upstream reverse proxy (Nginx / Cloudflare / Load Balancers)
// This ensures req.protocol ('https') and req.hostname are accurate from X-Forwarded-* headers
app.set("trust proxy", true);

app.use(compression());

// Request header normalization and reverse proxy handling
app.use((req, _res, next) => {
  const hostHeader = (req.headers["host"] || "").toLowerCase();
  const isLoopback =
    hostHeader.startsWith("localhost") ||
    hostHeader.startsWith("127.0.0.1") ||
    hostHeader.startsWith("0.0.0.0") ||
    hostHeader.startsWith("[::1]");

  // Default x-forwarded-for to req.ip if not provided
  if (!req.headers["x-forwarded-for"]) {
    req.headers["x-forwarded-for"] = req.ip || req.socket.remoteAddress || "127.0.0.1";
  }
  if (!req.headers["x-real-ip"]) {
    req.headers["x-real-ip"] = req.ip || req.socket.remoteAddress || "127.0.0.1";
  }

  // Only set forwarded proto if behind reverse proxy in production (NOT on direct localhost/demo connections)
  if (!isLoopback && process.env.APP_ORIGIN) {
    try {
      const parsedOrigin = new URL(process.env.APP_ORIGIN);
      if (parsedOrigin.protocol === "https:" && !req.headers["x-forwarded-proto"]) {
        req.headers["x-forwarded-proto"] = "https";
      }
    } catch {
      // ignore URL parsing error
    }
  }
  next();
});

// CORS support for allowed origins and preflight OPTIONS handling
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    let allowed = false;
    try {
      const originUrl = new URL(origin);
      const host = (req.headers["host"] || "").toLowerCase();
      const isLoopbackHost = (h) => {
        const clean = h.split(":")[0].toLowerCase();
        return clean === "localhost" || clean === "127.0.0.1" || clean === "0.0.0.0" || clean === "::1";
      };

      if (
        process.env.APP_ORIGIN &&
        originUrl.origin.toLowerCase() === new URL(process.env.APP_ORIGIN).origin.toLowerCase()
      ) {
        allowed = true;
      } else if (originUrl.host.toLowerCase() === host) {
        allowed = true;
      } else if (
        isLoopbackHost(originUrl.hostname) &&
        (isLoopbackHost(host) || process.env.NODE_ENV !== "production")
      ) {
        allowed = true;
      } else if (process.env.ALLOWED_ORIGINS) {
        const extra = process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim().toLowerCase());
        if (extra.includes(origin.toLowerCase()) || extra.includes(originUrl.host.toLowerCase())) {
          allowed = true;
        }
      }
    } catch {
      allowed = false;
    }

    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, Accept, Origin",
      );
      res.setHeader("Vary", "Origin");
    }
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Static assets
app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
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
  }),
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
