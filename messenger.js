import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { sleep, rand, digits, chatIdFor } from "./util.js";
import { db } from "./database.js";

// ── WhatsApp client (whatsapp-web.js drives Chromium via Puppeteer) ──
export const client = new Client({
  authStrategy: new LocalAuth({ dataPath: process.env.WWEBJS_DATA || "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  },
});

export let lastQr = "";
export let ready = false;

client.on("qr", (qr) => {
  lastQr = qr;
  console.log("\n📱 Scan this QR with WhatsApp (Linked Devices):\n");
  qrcode.generate(qr, { small: true });
});
client.on("ready", () => { ready = true; console.log("✅ WhatsApp client ready."); });
client.on("auth_failure", (m) => console.error("[wa] auth failure:", m));
client.on("disconnected", (r) => { ready = false; console.error("[wa] disconnected:", r); });

// ── Safety: rate limit (per conversation) + identical-message guard ──
const windowHits = new Map(); // number -> [timestamps]
const lastSent = new Map();   // number -> last outgoing text

// Max 10 inbound replies handled per conversation per minute.
export function canReply(number) {
  const id = digits(number);
  const now = Date.now();
  const hits = (windowHits.get(id) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 10) { windowHits.set(id, hits); return false; }
  hits.push(now);
  windowHits.set(id, hits);
  return true;
}

/**
 * Send a message with human-like safety: typing indicator, 1–3s random delay,
 * and never sending the exact same text back-to-back. Logs to the DB as "bot".
 */
export async function sendMessage(number, text) {
  if (!text) return;
  const id = digits(number);
  let out = text;
  if (lastSent.get(id) === out) out = out + " ‎"; // tweak to avoid identical repeat
  const chatId = chatIdFor(id);
  try {
    try {
      const chat = await client.getChatById(chatId);
      await chat.sendStateTyping();
    } catch { /* typing is best-effort */ }
    await sleep(rand(1000, 3000));
    await client.sendMessage(chatId, out);
    lastSent.set(id, out);
    if (db.get(id)) db.addMessage(id, "bot", out);
  } catch (err) {
    console.error(`[wa] send to ${id} failed:`, err.message);
  }
}

// Send to an admin/arbitrary number that may not be a saved customer (no DB log).
export async function sendRaw(number, text) {
  try {
    await client.sendMessage(chatIdFor(number), text);
  } catch (err) {
    console.error(`[wa] raw send to ${digits(number)} failed:`, err.message);
  }
}
