import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { db } from "./database.js";
import { digits } from "./util.js";
import { client, canReply, ready, lastQrImage } from "./messenger.js";
import { processMessage } from "./conversation.js";
import { handleAdminCommand } from "./adminCommands.js";

// ── Incoming WhatsApp messages ───────────────────────────────────
let lastInbound = null;

// Use "message_create" (fires reliably for incoming on all WhatsApp Web
// versions); we ignore our own outgoing messages via msg.fromMe below.
client.on("message_create", async (msg) => {
  try {
    if (msg.fromMe) return;
    // Only handle 1:1 chats — skip groups, status broadcasts, channels.
    if (msg.from.endsWith("@g.us") || msg.from.includes("broadcast") || msg.from.endsWith("@newsletter")) return;

    // Resolve the sender's REAL phone number. WhatsApp now often addresses
    // senders by a privacy "@lid" id instead of their number (so msg.from can be
    // a LID) — getContact() returns the true phone number.
    let number = digits(msg.from);
    try {
      const contact = await msg.getContact();
      const real = digits(contact?.number || contact?.id?.user || "");
      if (real) number = real;
    } catch { /* keep msg.from digits */ }

    const body = (msg.body || "").trim();
    lastInbound = { from: number, body: body.slice(0, 40), fromMe: msg.fromMe, at: new Date().toISOString() };
    console.log("[msg] in:", JSON.stringify(lastInbound));
    if (!body) return;

    // Admin channel — commands only.
    if (number === config.adminNumber) {
      await handleAdminCommand(body);
      return;
    }

    const cust = db.get(number);
    if (cust?.blocked) return;                       // blocked → silence
    if (cust?.paused) { db.addMessage(number, "user", body); return; } // human handling — just log
    if (!canReply(number)) return;                   // rate limit: 10/min/convo

    await processMessage(number, body);
  } catch (e) {
    console.error("[dispatch] error:", e.message);
  }
});

// ── Tiny HTTP surface (health, QR, admin dashboard data) ─────────
const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ ok: true, ready, admin: config.adminNumber, lastInbound, service: "techstop-whatsapp-bot" })
);

app.get("/qr", (_req, res) => {
  if (ready) return res.send("<h2 style='font-family:sans-serif'>✅ WhatsApp is already linked. No QR needed.</h2>");
  if (!lastQrImage) {
    return res.send("<meta http-equiv='refresh' content='3'><h2 style='font-family:sans-serif'>⏳ Generating QR… this page refreshes automatically.</h2>");
  }
  res.send(
    "<meta http-equiv='refresh' content='20'>" +
    "<div style='text-align:center;font-family:sans-serif;padding:24px'>" +
    "<h2>Scan with WhatsApp → Linked Devices → Link a Device</h2>" +
    `<img src="${lastQrImage}" style="width:320px;height:320px"/>` +
    "<p>Page refreshes every 20s. Once linked it will say ✅.</p></div>"
  );
});

// Read-only customer list for an admin dashboard (password protected).
app.get("/api/customers", (req, res) => {
  const key = req.query.key;
  if (!config.adminDashboardPassword || key !== config.adminDashboardPassword) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  const customers = db.all().map((c) => ({
    number: c.number, name: c.name, email: c.email, plan: c.plan, device: c.device,
    source: c.source, keyword: c.keyword, mode: c.mode, stage: c.stage,
    status: c.status || "", paused: c.paused, blocked: c.blocked,
    createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length,
  }));
  res.json({ ok: true, count: customers.length, customers });
});

app.listen(config.port, () => {
  console.log(`🌐 HTTP listening on :${config.port}`);
  console.log(`   Admin: ${config.adminNumber} · Model: ${config.model}`);
  console.log("   Initializing WhatsApp client…");
  client.initialize();
});
