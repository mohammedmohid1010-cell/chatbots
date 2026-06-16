import { db } from "./database.js";
import { askClaude } from "./claude.js";
import { sendMessage, sendRaw } from "./messenger.js";
import {
  config, MSG, DEVICES, flowFor, detectKeyword,
  ESCALATION_WORDS, DISCOUNT_WORDS,
} from "./config.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const alertAdmin = (text) => sendRaw(config.adminNumber, text);

// ── Escalation ───────────────────────────────────────────────────
async function escalate(number, cust, body, reason) {
  const now = Date.now();
  // Throttle admin alerts to once per 10 min per customer (still reassure the customer).
  if (now - (cust.escalatedAt || 0) > 10 * 60 * 1000) {
    await alertAdmin(
      "⚠️ Human Help Needed\n" +
      `Customer: ${cust.name || "(no name)"} ${number}\n` +
      `Issue: ${body}\n` +
      (reason ? `Reason: ${reason}\n` : "") +
      `Type !takeover ${number} to intervene`
    );
    db.upsert(number, { escalatedAt: now });
  }
  await sendMessage(number, MSG.escalateCustomer);
}

function escalationTriggered(body) {
  const t = body.toLowerCase();
  return ESCALATION_WORDS.some((w) => t.includes(w));
}

// ── Sales pipeline ───────────────────────────────────────────────
function contentChoice(body) {
  const t = body.toLowerCase();
  if (/\b1\b|1️⃣/.test(body) || /cricket|bollywood|indian|pakistani|hindi|urdu/.test(t)) return "Bronze";
  if (/\b2\b|2️⃣/.test(body) || /football|arabic|european|europe|soccer/.test(t)) return "Gold";
  return null;
}

async function finalizeEmail(number, cust) {
  const isIphone = Number(cust.deviceNum) === 6;
  if (isIphone) {
    await alertAdmin(
      "⚠️ New iPhone Trial Request\n" +
      `Name: ${cust.name}\n` +
      `Number: ${number}\n` +
      `Email: ${cust.email}\n` +
      `Plan: ${cust.plan}\n` +
      "App: IPTV Smarters Pro\n" +
      `Type !trial ${number} username:password to send credentials`
    );
  } else {
    await alertAdmin(
      "⚠️ New Bronze Trial Request\n" +
      `Name: ${cust.name}\n` +
      `Number: ${number}\n` +
      `Email: ${cust.email}\n` +
      `Device: ${cust.device}\n` +
      "App: Downloader code 8137617\n" +
      `Type !trial ${number} username:password to send credentials`
    );
  }
  db.upsert(number, { stage: "done" });
  await sendMessage(number, MSG.emailReceived.replace("{NAME}", cust.name.split(" ")[0] || "there"));
}

async function finalizeMac(number, cust, rawBody) {
  const macMatch = rawBody.match(/([0-9a-f]{2}[:\-]){5}[0-9a-f]{2}/i);
  const mac = macMatch ? macMatch[0] : "";
  const key = rawBody.replace(mac, "").replace(/mac[:\s]*/i, "").replace(/(device )?key[:\s]*/i, "").trim();
  db.upsert(number, { mac, deviceKey: key });

  const isTV = Number(cust.deviceNum) === 4 || Number(cust.deviceNum) === 5; // Samsung/LG
  if (isTV) {
    await alertAdmin(
      "⚠️ New Samsung/LG Trial Request\n" +
      `Name: ${cust.name}\n` +
      `Number: ${number}\n` +
      `Plan: ${cust.plan}\n` +
      `MAC: ${mac || "(see message)"}\n` +
      `Device Key: ${key || "(see message)"}\n` +
      `Raw: ${rawBody}\n` +
      `Please activate in panel then type !activated ${number}`
    );
  } else {
    await alertAdmin(
      "⚠️ New Gold Trial Request\n" +
      `Name: ${cust.name}\n` +
      `Number: ${number}\n` +
      `Device: ${cust.device}\n` +
      `MAC: ${mac || "(see message)"}\n` +
      `Device Key: ${key || "(see message)"}\n` +
      `Raw: ${rawBody}\n` +
      `Please activate in panel then type !activated ${number}`
    );
  }
  db.upsert(number, { stage: "done" });
  await sendMessage(number, MSG.macReceived);
}

// Returns true if the message was consumed by a pipeline step.
async function handleSales(number, cust, body) {
  switch (cust.stage) {
    case "await_content": {
      const plan = contentChoice(body);
      if (!plan) { await sendMessage(number, MSG.intro); return true; }
      db.upsert(number, { plan, stage: "await_device" });
      const rec = plan === "Bronze" ? "Bronze is perfect for that! 🥉" : "Gold is the one for you! 🥇";
      await sendMessage(number, `${rec}\n\n${MSG.deviceQuestion}`);
      return true;
    }
    case "await_device": {
      const m = body.match(/[1-6]/);
      if (!m) { await sendMessage(number, MSG.deviceQuestion); return true; }
      const deviceNum = Number(m[0]);
      const device = DEVICES[deviceNum];
      const flow = flowFor(cust.plan, deviceNum);
      db.upsert(number, { device, deviceNum, flowType: flow.type, app: flow.app, stage: "await_name" });
      await sendMessage(number, MSG.askName);
      return true;
    }
    case "await_name": {
      const name = body.trim().slice(0, 60);
      const updated = db.upsert(number, { name });
      if (updated.flowType === "email") {
        db.upsert(number, { stage: "await_email" });
        await sendMessage(number, MSG.askEmail);
      } else {
        db.upsert(number, { stage: "await_mac" });
        await sendMessage(number, MSG.askMac.replace("{APP}", updated.app));
      }
      return true;
    }
    case "await_email": {
      const email = body.trim();
      if (!EMAIL_RE.test(email)) {
        await sendMessage(number, "Hmm, that doesn't look like a valid email 🤔 Please send it again (e.g. you@gmail.com).");
        return true;
      }
      const updated = db.upsert(number, { email });
      await finalizeEmail(number, updated);
      return true;
    }
    case "await_mac": {
      await finalizeMac(number, cust, body);
      return true;
    }
    default:
      return false; // stage "done" / unknown → let fallback handle
  }
}

// ── Support pipeline (returning customers) ───────────────────────
async function handleSupport(number, cust, body) {
  if (cust.stage === "support_menu") {
    const m = body.match(/[1-4]/);
    const choice = m ? m[0] : null;
    if (choice === "1") {
      await alertAdmin(
        "⚠️ Renewal Request\n" +
        `Customer: ${cust.name || "(no name)"}\n` +
        `Number: ${number}\n` +
        `Current plan: ${cust.plan || "(unknown)"}\n` +
        `Device: ${cust.device || "(unknown)"}`
      );
      db.upsert(number, { stage: "support_open" });
      await sendMessage(number, "Your renewal request has been sent — our team will confirm the details with you shortly 🙏");
      return true;
    }
    if (choice === "2") {
      db.upsert(number, { stage: "support_open" });
      await sendMessage(number, "Sure! Tell me what's happening and I'll help you fix it 👇");
      return true;
    }
    if (choice === "3") {
      db.upsert(number, { stage: "support_open" });
      await sendMessage(number, "Happy to help you change plan! 😊 Which plan would you like — Bronze (AED 140) or Gold (AED 200)?");
      return true;
    }
    if (choice === "4") {
      db.upsert(number, { stage: "support_open" });
      await sendMessage(number, "Of course — go ahead, how can I help? 😊");
      return true;
    }
    await sendMessage(number, MSG.supportMenu(cust.name));
    return true;
  }
  return false; // support_open / other → fallback to Claude
}

// ── Main entry ───────────────────────────────────────────────────
export async function processMessage(number, body) {
  let cust = db.get(number);

  // New number → must contain an ad keyword to engage.
  if (!cust) {
    const kw = detectKeyword(body);
    if (!kw) { await sendRaw(number, MSG.notOfficial); return; }
    cust = db.upsert(number, { keyword: kw.keyword, source: kw.source, mode: "sales", stage: "await_content" });
    db.addMessage(number, "user", body);
    await sendMessage(number, MSG.intro);
    return;
  }

  db.addMessage(number, "user", body);

  // Escalation triggers (keywords / frustration) — check first, even post-sale.
  if (escalationTriggered(body)) { await escalate(number, cust, body); return; }

  // Finished onboarding and came back → switch to support and show the menu.
  if (cust.mode === "sales" && cust.stage === "done") {
    db.upsert(number, { mode: "support", stage: "support_menu" });
    await sendMessage(number, MSG.supportMenu(cust.name));
    return;
  }

  // Pipeline handling.
  if (cust.mode === "sales") {
    if (await handleSales(number, cust, body)) return;
  } else if (cust.mode === "support") {
    if (await handleSupport(number, cust, body)) return;
  }

  // Discount intent → exact value message.
  if (DISCOUNT_WORDS.some((w) => body.toLowerCase().includes(w))) {
    await sendMessage(number, MSG.discount);
    return;
  }

  // Repeated same question 3× → escalate instead of looping.
  if (db.bumpQuestion(number, body) >= 3) {
    await escalate(number, cust, body, "Asked the same question 3 times");
    return;
  }

  // Fallback → Claude Haiku (history already ends with this message).
  const reply = await askClaude(db.get(number).messages);
  await sendMessage(number, reply);
}
