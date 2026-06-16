import { db } from "./database.js";
import { sendMessage, sendRaw } from "./messenger.js";
import { sleep } from "./util.js";
import { config, GUIDES } from "./config.js";

const reply = (text) => sendRaw(config.adminNumber, text);

const HELP =
  "🤖 *TechStop Bot — Admin Commands*\n" +
  "!trial <number> user:pass — send credentials + setup guide\n" +
  "!activated <number> — confirm MAC activation\n" +
  "!reply <number> <message> — send a custom message\n" +
  "!takeover <number> — pause the bot for that customer\n" +
  "!resume <number> — let the bot take over again\n" +
  "!block <number> — block a number\n" +
  "!status <number> — show customer details + history\n" +
  "!broadcast <message> — message all customers (max 50)";

// Pick the right post-credential / post-activation guide for a customer.
function credentialGuide(cust, u, p) {
  if (Number(cust.deviceNum) === 6) return GUIDES.iphoneSmarters(u, p); // iPhone/iPad
  return GUIDES.bronzeDownloader(u, p); // Bronze Android-family
}
function activationGuide(cust) {
  const n = Number(cust.deviceNum);
  if (n === 4 || n === 5) return GUIDES.crPlayerActivated; // Samsung / LG
  return GUIDES.televisorActivated; // Gold Android-family
}

export async function handleAdminCommand(body) {
  if (!body.startsWith("!")) return; // ignore non-command admin chatter

  const [cmd, ...rest] = body.trim().split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd.toLowerCase()) {
    case "!trial": {
      const number = rest[0];
      const creds = rest.slice(1).join(" ");
      const cust = db.get(number);
      if (!cust) return reply(`❌ No customer found for ${number}.`);
      const [u, p] = creds.split(":");
      if (!u || !p) return reply("❌ Format: !trial <number> username:password");
      db.upsert(number, { username: u, password: p, status: "active" });
      await sendMessage(number, credentialGuide(cust, u, p));
      return reply(`✅ Credentials sent to ${cust.name || number}.`);
    }

    case "!activated": {
      const number = rest[0];
      const cust = db.get(number);
      if (!cust) return reply(`❌ No customer found for ${number}.`);
      db.upsert(number, { status: "active" });
      await sendMessage(number, activationGuide(cust));
      return reply(`✅ Activation confirmed to ${cust.name || number}.`);
    }

    case "!reply": {
      const number = rest[0];
      const message = rest.slice(1).join(" ");
      if (!number || !message) return reply("❌ Format: !reply <number> <message>");
      await sendMessage(number, message);
      return reply(`✅ Sent to ${number}.`);
    }

    case "!takeover": {
      const number = rest[0];
      db.upsert(number, { paused: true });
      return reply(`🛑 Bot paused for ${number}. You're handling this chat now.`);
    }

    case "!resume": {
      const number = rest[0];
      db.upsert(number, { paused: false, escalatedAt: 0 });
      return reply(`▶️ Bot resumed for ${number}.`);
    }

    case "!block": {
      const number = rest[0];
      db.upsert(number, { blocked: true });
      return reply(`🚫 Blocked ${number}.`);
    }

    case "!status": {
      const number = rest[0];
      const c = db.get(number);
      if (!c) return reply(`❌ No customer found for ${number}.`);
      const recent = c.messages.slice(-8)
        .map((m) => `${m.role === "user" ? "👤" : m.role === "admin" ? "🧑‍💼" : "🤖"} ${m.text}`)
        .join("\n");
      return reply(
        `📋 *${c.name || "(no name)"}* — ${c.number}\n` +
        `Plan: ${c.plan || "-"} · Device: ${c.device || "-"}\n` +
        `Email: ${c.email || "-"}\n` +
        `Source: ${c.source || "-"} (${c.keyword || "-"})\n` +
        `Mode: ${c.mode}/${c.stage} · ${c.paused ? "PAUSED" : "active"}${c.blocked ? " · BLOCKED" : ""}\n` +
        (c.mac ? `MAC: ${c.mac}  Key: ${c.deviceKey}\n` : "") +
        `\n*Recent:*\n${recent || "(none)"}`
      );
    }

    case "!broadcast": {
      if (!arg) return reply("❌ Format: !broadcast <message>");
      const targets = db.all().filter((c) => !c.blocked).slice(0, 50);
      reply(`📢 Broadcasting to ${targets.length} customers…`);
      let sent = 0;
      for (const c of targets) {
        await sendMessage(c.number, arg);
        sent++;
        await sleep(3000); // ≥3s between messages
      }
      return reply(`✅ Broadcast finished — ${sent} sent.`);
    }

    default:
      return reply(HELP);
  }
}
