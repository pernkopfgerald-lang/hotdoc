import { Router } from "express";
import { env } from "../config.js";

export const healthRouter: Router = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

healthRouter.get("/api/version", (_req, res) => {
  res.json({
    name: "@hotdoc/api",
    version: "0.1.0",
    env: env.NODE_ENV,
    features: {
      blaulichtSms: !!env.BLAULICHTSMS_CUSTOMER_ID,
      syBos: !!env.SYBOS_API_URL,
      // wasserkarte: ausgeklammert (Phase ?)
      webPush: !!env.VAPID_PUBLIC,
    },
  });
});

/**
 * Root-Hinweis. Wer aus Versehen die API-Domain im Browser öffnet, soll
 * keinen "Cannot GET /"-Express-Default sehen sondern einen sauberen
 * Mini-Hinweis mit Verweis auf die Web-Frontends.
 */
healthRouter.get("/", (_req, res) => {
  res
    .status(200)
    .type("text/html; charset=utf-8")
    .send(`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>HotDoc · API</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body {
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: linear-gradient(180deg, #fafafa, #f0f0f3);
    color: #1a1a1a;
  }
  @media (prefers-color-scheme: dark) {
    body { background: linear-gradient(180deg, #0e0e10, #1a1a1d); color: #f0f0f0; }
    .card { background: #1f1f24; border-color: #2d2d33; }
    code { background: #2a2a30; color: #f0f0f0; }
  }
  .card {
    max-width: 460px;
    padding: 28px 30px;
    background: #fff;
    border: 1px solid #e4e4e8;
    border-radius: 16px;
    box-shadow: 0 12px 48px -16px rgba(0,0,0,0.18);
  }
  h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: -0.01em; }
  .sub { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-bottom: 18px; }
  .grid { display: grid; gap: 8px; }
  .row { display: flex; gap: 10px; align-items: center; }
  code { font-family: ui-monospace, "JetBrains Mono", Menlo, monospace; font-size: 12px; padding: 2px 8px; border-radius: 6px; background: #f0f0f3; }
  a { color: #c8102e; text-decoration: none; font-weight: 600; }
  a:hover { text-decoration: underline; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #34c759; display: inline-block; box-shadow: 0 0 0 4px rgba(52,199,89,0.18); }
</style>
</head>
<body>
  <main class="card">
    <h1>HotDoc · API</h1>
    <div class="sub">Backend · FF Eberstalzell</div>
    <div class="grid">
      <div class="row"><span class="dot"></span><span>API online</span></div>
      <div class="row"><code>GET /healthz</code> Liveness-Probe</div>
      <div class="row"><code>GET /api/version</code> Build-Info</div>
    </div>
    <p style="margin-top:22px;font-size:13px;color:#666;">
      Diese URL bedient nur die JSON-API. Die Web-Frontends:
    </p>
    <div class="grid" style="margin-top:6px">
      <div>· <a href="https://hotdoc-eberstalzell.fly.dev/">PWA für Tablets</a></div>
      <div>· <a href="https://hotdoc-backoffice.fly.dev/">Backoffice / Florianstation</a></div>
    </div>
  </main>
</body>
</html>`);
});
