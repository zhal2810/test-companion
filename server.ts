import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing body
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // CORS middleware for external deployments (e.g. Cloudflare Pages)
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-API-Key");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // API Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "WarEra Planner Backend Proxy is online!" });
  });

  // Dynamic player procedure proxy
  app.all("/api/players/:procedure", async (req, res) => {
    const { procedure } = req.params;
    console.log(`[Proxy players] ${req.method} procedure: ${procedure}`);

    // Parse input from query parameters (GET) or request body (POST)
    const rawInput = req.method === "GET" ? req.query : (req.body?.input ?? req.body ?? {});
    let input: Record<string, any> = {};

    try {
      input = typeof rawInput === "string" ? JSON.parse(rawInput) : { ...rawInput };
    } catch (e) {
      input = {};
    }

    // Convert numeric strings to actual numbers (required by tRPC Zod validations on WarEra servers)
    for (const key in input) {
      if (typeof input[key] === "string" && input[key].trim() !== "") {
        const num = Number(input[key]);
        if (!Number.isNaN(num)) {
          input[key] = num;
        }
      }
    }

    const apiKey = req.headers["x-api-key"];

    try {
      const targetUrl = `https://api2.warera.io/trpc/${procedure}`;
      console.log(`[Proxy players] Forwarding to ${targetUrl} with input:`, JSON.stringify(input));

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["X-API-Key"] = apiKey as string;
      }

      // WarEra's backend endpoints always expect a POST for tRPC procedures
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });

      res.status(response.status);
      const json = await response.json();
      res.json(json);
    } catch (err: any) {
      console.error(`[Proxy Error] Failed to fetch procedure ${procedure}:`, err);
      res.status(500).json({
        error: "Gagal memanggil API WarEra",
        detail: err.message,
      });
    }
  });

  // Market items price proxy
  app.get("/api/market/items", async (req, res) => {
    const procedure = "itemTrading.getPrices";
    try {
      const targetUrl = `https://api2.warera.io/trpc/${procedure}`;
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      res.status(response.status);
      const json = await response.json();
      res.json(json);
    } catch (err: any) {
      console.error(`[Proxy Error] Failed to fetch market items:`, err);
      res.status(502).json({
        error: "Gagal mengambil data market",
        detail: err.message,
      });
    }
  });

  // Market statistics from local json
  app.get("/api/market/stats", (req, res) => {
    try {
      const filePath = path.join(process.cwd(), "temp_warera_stats.json");
      if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, "utf-8");
        const stats = JSON.parse(rawData);
        res.json({ success: true, data: stats });
      } else {
        res.status(404).json({ success: false, error: "File temp_warera_stats.json tidak ditemukan" });
      }
    } catch (err: any) {
      console.error("[Market Proxy Error] getMarketStats:", err.message);
      res.status(500).json({
        success: false,
        error: "Gagal membaca statistik pasar",
        detail: err.message,
      });
    }
  });

  // Market sparklines proxy from WarEra Pulse
  app.get("/api/market/spark", async (req, res) => {
    try {
      const targetUrl = "https://www.warera-pulse.info/api/spark";
      const response = await fetch(targetUrl);
      const json = await response.json();
      res.json({ success: true, data: json });
    } catch (err: any) {
      console.error("[Proxy Error] Failed to fetch market sparklines:", err);
      res.status(502).json({
        success: false,
        error: "Gagal mengambil data history/sparklines",
        detail: err.message,
      });
    }
  });

  // Market history (candles) proxy from WarEra Pulse
  app.get(["/api/market/history/:itemCode", "/api/pulse/history/:itemCode"], async (req, res) => {
    try {
      const { itemCode } = req.params;
      const { tf = "week" } = req.query; // 'day', 'week', 'month'
      const targetUrl = `https://www.warera-pulse.info/api/history/${itemCode.toLowerCase()}?tf=${tf}`;
      const response = await fetch(targetUrl);
      const json = await response.json();
      res.json({ success: true, ...json, data: json?.candles || json });
    } catch (err: any) {
      console.error(`[Proxy Error] Failed to fetch market history for ${req.params.itemCode}:`, err);
      res.status(502).json({
        success: false,
        error: "Gagal mengambil data history lilin",
        detail: err.message,
      });
    }
  });

  // Market snapshot proxy from WarEra Pulse
  app.get("/api/market/pulse-snapshot", async (req, res) => {
    try {
      const targetUrl = "https://www.warera-pulse.info/api/snapshot";
      const response = await fetch(targetUrl);
      const json = await response.json();
      res.json({ success: true, data: json });
    } catch (err: any) {
      console.error("[Proxy Error] Failed to fetch market snapshot:", err);
      res.status(502).json({
        success: false,
        error: "Gagal mengambil data snapshot",
        detail: err.message,
      });
    }
  });

  // WarEra API Proxy Route (Fallback wildcard)
  // Forwards any request to api2.warera.io
  app.all("/api/warera/*", async (req, res) => {
    try {
      const subPath = req.url.replace(/^\/api\/warera/, "");
      
      // Construct the real URL to call on api2.warera.io
      const targetUrl = `https://api2.warera.io${subPath}`;
      
      console.log(`[Proxy] ${req.method} ${req.url} -> ${targetUrl}`);

      // Forward request with fetch
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Forward headers if they are authorization or custom game headers
      if (req.headers["authorization"]) {
        headers["authorization"] = req.headers["authorization"] as string;
      }
      if (req.headers["x-api-key"]) {
        headers["x-api-key"] = req.headers["x-api-key"] as string;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers: headers,
      };

      // Only add body for non-GET methods if any exists
      if (req.method !== "GET" && req.method !== "HEAD" && req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      
      // Get content type
      const contentType = response.headers.get("content-type") || "";
      
      // Set correct status
      res.status(response.status);

      // Copy response headers that are safe to forward
      const safeHeaders = ["content-type", "cache-control", "expires", "pragma"];
      safeHeaders.forEach(h => {
        const val = response.headers.get(h);
        if (val) res.setHeader(h, val);
      });

      if (contentType.includes("application/json")) {
        const json = await response.json();
        res.json(json);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (err: any) {
      console.error("[Proxy Error] Failed to contact WarEra API:", err);
      res.status(502).json({
        error: "WarEra API Connection Failed",
        message: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Vite middleware for development or Static server for production
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Backend Server] listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server bootstrap failure:", err);
  process.exit(1);
});
