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
