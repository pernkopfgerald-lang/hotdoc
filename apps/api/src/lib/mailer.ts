/**
 * SMTP-Mailversand (Audit 2026-09) — bisher gab es im Backend keinerlei
 * E-Mail-Infrastruktur. Lazy-Init nach demselben Muster wie der Puppeteer-
 * Browser (services/pdf/generator.ts): Transporter erst beim ersten
 * tatsaechlichen Versand aufbauen, nicht beim Server-Boot.
 *
 * Konfiguration ausschliesslich ueber fly.io-Secrets (SMTP_HOST/PORT/USER/
 * PASS/FROM) — Claude Code darf laut Projektregeln keine Zugangsdaten sehen
 * oder eintippen. Fehlt die Konfiguration, wird NICHT geworfen: der Aufrufer
 * (Einsatz-Abschluss) darf durch einen fehlenden/fehlerhaften Mailversand
 * nicht blockiert werden — es wird nur gewarnt.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

let transporterPromise: Promise<Transporter | null> | null = null;

function readSmtpConfig(): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
} | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? "587");
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    // Port 465 = implizites TLS; alles andere (587/25) startet unverschluesselt
    // und wechselt per STARTTLS — Standardverhalten, ueberschreibbar per Flag.
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user,
    pass,
    from: process.env.SMTP_FROM ?? user,
  };
}

async function getTransporter(): Promise<Transporter | null> {
  if (transporterPromise) return transporterPromise;
  transporterPromise = (async () => {
    const cfg = readSmtpConfig();
    if (!cfg) {
      logger.warn(
        "SMTP nicht konfiguriert (SMTP_HOST/SMTP_USER/SMTP_PASS fehlen) — Mailversand deaktiviert",
      );
      return null;
    }
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  })();
  return transporterPromise;
}

/**
 * Versendet ein PDF als Anhang. Best-effort: Fehler werden geloggt, nie
 * geworfen — der Aufrufer (Einsatz-Abschluss) laeuft in jedem Fall weiter.
 */
export async function sendPdfMail(opts: {
  to: string;
  subject: string;
  text: string;
  pdfBuffer: Buffer;
  filename: string;
}): Promise<void> {
  try {
    const transporter = await getTransporter();
    if (!transporter) return;
    const cfg = readSmtpConfig();
    await transporter.sendMail({
      from: cfg?.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      attachments: [{ filename: opts.filename, content: opts.pdfBuffer, contentType: "application/pdf" }],
    });
    logger.info({ to: opts.to, subject: opts.subject }, "Bericht-PDF per Mail versendet");
  } catch (err) {
    logger.warn({ err, to: opts.to, subject: opts.subject }, "Mailversand fehlgeschlagen");
  }
}
