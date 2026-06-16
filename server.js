import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { db } from "./database.js";
import { digits } from "./util.js";
import { client, canReply, ready, lastQr } from "./messenger.js";
import { processMessage } from "./conversation.js";
import { handleAdminCommand } from "./adminCommands.js";

// ── Incoming WhatsApp messages ───────────────────────────────────
client.on("message", async (msg) => {
  try {
    if (msg.fromMe) return;
    if (!msg.from.endsWith("@c.us")) return; // ignore groups, status, broadcasts
    const number = digits(msg.from);
    const body = (msg.body || "").trim();
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

app.get("/health", (_req, res) => res.json({ ok: true, ready, service: "techstop-whatsapp-bot" }));

app.get("/qr", (_req, res) => {
  if (ready) return res.send("✅ WhatsApp is already linked. No QR needed.");
  if (!lastQr) return res.send("⏳ QR not generated yet — check back in a few seconds.");
  res.send(
    `<pre>Scan in WhatsApp → Linked Devices.\nIf this looks broken, scan the ASCII QR in the Railway deploy logs instead.\n\n${lastQr}</pre>`
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
