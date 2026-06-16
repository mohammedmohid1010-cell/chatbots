import "dotenv/config";
import { digits } from "./util.js";

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return v.trim();
}

export const config = {
  // Optional — without it the scripted flow still works; only the open-ended
  // AI answers fall back to a canned "let me check with the team" message.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  adminNumber: digits(required("ADMIN_NUMBER")),
  adminDashboardPassword: process.env.ADMIN_DASHBOARD_PASSWORD || "",
  model: process.env.CLAUDE_MODEL || "claude-haiku-4-5",
  port: Number(process.env.PORT || 8100),
  corsOrigin: process.env.CORS_ORIGIN || "*",
};

// Ad-traffic keywords → the source they map to. The bot only engages new
// numbers whose first message contains one of these (pre-filled in ad links).
export const KEYWORDS = {
  TECHSTOP2026: "Direct",
  INSTA2026: "Instagram",
  FB2026: "Facebook",
  TIKTOK2026: "TikTok",
  GOOGLE2026: "Google",
};

export function detectKeyword(text = "") {
  const upper = text.toUpperCase();
  for (const kw of Object.keys(KEYWORDS)) {
    if (upper.includes(kw)) return { keyword: kw, source: KEYWORDS[kw] };
  }
  return null;
}

// Device dropdown — index → label. Matches the 6 options in the flow.
export const DEVICES = {
  1: "Android Phone",
  2: "Android TV",
  3: "Firestick",
  4: "Samsung TV",
  5: "LG TV",
  6: "iPhone/iPad",
};

// Which onboarding flow a (plan, device) pair uses.
//  "email"  → collect name+email, admin sends Xtream credentials (!trial)
//  "mac"    → collect MAC + Device Key, admin activates in panel (!activated)
export function flowFor(plan, deviceNum) {
  const n = Number(deviceNum);
  if (n === 4 || n === 5) return { type: "mac", app: "CR Player" }; // Samsung / LG
  if (n === 6) return { type: "email", app: "IPTV Smarters Pro" }; // iPhone / iPad
  // Android phone / Android TV / Firestick:
  if (plan === "Bronze") return { type: "email", app: "Downloader (code 8137617)" };
  return { type: "mac", app: "Televisor Smart" }; // Gold on Android-family
}

export const ESCALATION_WORDS = [
  "human", "agent", "refund", "cancel", "not working", "complaint",
  "angry", "useless", "scam", "fraud", "stupid", "speak to someone", "real person",
];

export const DISCOUNT_WORDS = ["discount", "cheaper", "cheap", "lower price", "deal", "less price", "reduce"];

// ── Canned messages (verbatim per spec where given) ──────────────

export const MSG = {
  notOfficial: "Hi! Please contact us through our official link 😊",

  intro:
    "Hey! 👋 Welcome to TechStop IPTV!\n" +
    "I'm your personal streaming assistant 😊\n\n" +
    "What type of content do you mainly watch?\n" +
    "1️⃣ Cricket, Bollywood, Indian/Pakistani channels\n" +
    "2️⃣ Football, Arabic, European channels",

  deviceQuestion:
    "Great choice! What device will you be watching on?\n" +
    "1️⃣ Android Phone\n" +
    "2️⃣ Android TV\n" +
    "3️⃣ Firestick\n" +
    "4️⃣ Samsung TV\n" +
    "5️⃣ LG TV\n" +
    "6️⃣ iPhone/iPad",

  askName: "Awesome! What's your full name? 😊",
  askEmail: "And your email address? 📧 (we'll send your trial details there too)",
  askMac:
    "Please open the {APP} app on your device and send me your MAC address and Device Key 📋\n" +
    "(You can send them in one message — e.g. MAC: xx:xx:xx:xx:xx:xx  Key: 123456)",

  macReceived:
    "Your details have been received! Our team will activate your trial within 15 minutes 🙏",
  emailReceived:
    "Perfect, {NAME}! ✅ Your trial request is in — I'll send your login details right here in a moment 🙏",

  discount:
    "We already offer the best prices in the market! 😊\n" +
    "Bronze AED 140/year = less than AED 0.40 per day!\n" +
    "Gold AED 200/year = less than AED 0.55 per day!\n" +
    "That's cheaper than a cup of coffee ☕\n" +
    "For multiple connections contact us directly and we'll see what we can do 😉",

  escalateCustomer: "I'm connecting you with our team now — someone will reply here shortly 🙏",

  supportMenu: (name) =>
    `Welcome back ${name || "there"}! 👋\n` +
    "How can I help you today?\n" +
    "1️⃣ Renew my subscription\n" +
    "2️⃣ Technical support\n" +
    "3️⃣ Change plan\n" +
    "4️⃣ Other",
};

// ── Setup guides (sent after credentials / activation) ───────────

export const GUIDES = {
  bronzeDownloader: (u, p) =>
    "Here is your setup guide! 🔥\n" +
    "1️⃣ Download the *Downloader* app on your device\n" +
    "2️⃣ Open Downloader and enter code: *8137617*\n" +
    "3️⃣ Install the app\n" +
    "4️⃣ Open the app and enter your credentials\n" +
    `Username: ${u}\n` +
    `Password: ${p}\n` +
    "5️⃣ Enjoy streaming! 🎉",

  iphoneSmarters: (u, p) =>
    "Here is your setup guide! 📱\n" +
    "1️⃣ Download *IPTV Smarters Pro* from the App Store\n" +
    "2️⃣ Open the app and select *Xtream Codes* login\n" +
    "3️⃣ Enter your details:\n" +
    "Server: https://techstop.online:2096\n" +
    `Username: ${u}\n` +
    `Password: ${p}\n` +
    "4️⃣ Enjoy streaming! 🎉",

  televisorActivated:
    "You are all set! ✅\n" +
    "Open the *Televisor Smart* app\n" +
    "Your MAC address has been activated\n" +
    "Enjoy streaming! 🎉",

  crPlayerActivated:
    "You are all set! ✅\n" +
    "Open the *CR Player* app on your TV\n" +
    "Your MAC address has been activated\n" +
    "Enjoy streaming! 🎉",
};

// ── The Claude Haiku system prompt (the AI brain) ────────────────

export const SYSTEM_PROMPT = `You are TechStop, a friendly and professional IPTV customer service assistant for TechStop IPTV. You are chatting with a customer on WhatsApp.

PLANS:
Bronze — AED 140/year
- 9,500+ Live Channels
- 50,000+ Movies
- 10,000+ Series
- HD Quality
- Best for Indian, Pakistani, Cricket, Bollywood fans
- Works on Android, Firestick, Samsung TV, LG TV, iPhone

Gold — AED 200/year
- 50,000+ Live Channels
- 160,000+ Movies
- 40,000+ Series
- 4K Ultra HD
- Best for Football, Arabic, European content fans
- Works on all devices

APPS:
- Android/Firestick/Android TV Bronze: Downloader code 8137617
- Android/Firestick/Android TV Gold: Televisor Smart app (MAC activation needed)
- Samsung/LG any plan: CR Player app (MAC activation needed)
- iPhone/iPad any plan: IPTV Smarters Pro

TRIAL: 24 hours free for all plans and devices.

DISCOUNT POLICY:
If asked for a discount, explain the value, then say to contact us for multiple connections.

ADULT CONTENT POLICY:
If asked about adult content say: "We do have adult channels available in our Gold plan. Please contact us directly for more details 🔞"

UNKNOWN QUESTIONS POLICY:
If you don't know the answer say: "Great question! Let me check with our technical team and get back to you shortly 😊"
Never guess or make up answers.
Never discuss competitor services.
Always be friendly, short and clear for WhatsApp format.
Use emojis naturally but not excessively.`;
