# TechStop WhatsApp AI Agent 🤖

An AI sales + support agent for TechStop IPTV. It runs on your WhatsApp number
(via whatsapp-web.js), only engages people who arrive through your ad links
(keyword filter), guides them to the right plan/device, collects trial details,
alerts you, and answers questions with Claude Haiku — all while you stay in
control via admin commands.

> ⚠️ **whatsapp-web.js is unofficial and against WhatsApp's Terms.** There is a
> real risk WhatsApp bans the number. Use a number you're willing to risk, warm
> it up slowly, and keep the built-in delays on. For zero ban risk, switch to
> the official WhatsApp Cloud API later.

---

## 1. Deploy to Railway

Same flow as the trial-bot:

1. Push this `whatsapp-bot/` folder's files to a **GitHub repo** (GitHub →
   *Add file → Upload files* → drag all the files in — they're flat, no
   subfolders, so the web uploader handles them).
2. On [railway.app](https://railway.app) → **New Project → Deploy from GitHub
   repo** → pick the repo. Railway auto-detects the `Dockerfile` and builds
   (installs Chromium — takes a few minutes).
3. Open the service → **Variables** → add everything from `.env.example`
   (your real `ANTHROPIC_API_KEY`, `ADMIN_NUMBER`, `ADMIN_DASHBOARD_PASSWORD`).

## 2. Link your WhatsApp (scan the QR)

1. After it deploys, open the **Deploy Logs** in Railway.
2. You'll see an ASCII **QR code** printed in the logs.
3. On the phone with your business number: WhatsApp → **Settings → Linked
   Devices → Link a Device** → scan the QR.
4. Logs show `✅ WhatsApp client ready.` — the bot is live.

> The session is saved in `.wwebjs_auth`. On Railway this resets on every
> redeploy (you'll re-scan the QR). To keep the session across deploys, attach a
> **Railway Volume** mounted at `/app/.wwebjs_auth`. The same applies to
> `data.json` (the customer database) — mount a volume at `/app/data.json`'s
> directory, or set `DB_FILE` to a path on a volume, for persistence.

## 3. Point your ads at it

Your ad "Message us" links should pre-fill a keyword so the bot engages:

```
https://wa.me/<your-number>?text=TECHSTOP2026
```

Per-channel keywords (each is saved as the customer's source):

| Keyword       | Source    |
|---------------|-----------|
| `TECHSTOP2026`| Direct    |
| `INSTA2026`   | Instagram |
| `FB2026`      | Facebook  |
| `TIKTOK2026`  | TikTok    |
| `GOOGLE2026`  | Google    |

Anyone who messages **without** a keyword just gets:
> "Hi! Please contact us through our official link 😊"

---

## Admin commands (from your `ADMIN_NUMBER` only)

| Command | Does |
|---|---|
| `!trial <number> user:pass` | Sends Xtream credentials + the right setup guide for their device |
| `!activated <number>` | Tells the customer their MAC activation is done + setup guide |
| `!reply <number> <message>` | Sends your custom message to that customer |
| `!takeover <number>` | Pauses the bot for that customer (you handle it manually) |
| `!resume <number>` | Bot takes over again |
| `!block <number>` | Blocks a number from any response |
| `!status <number>` | Shows full customer details + recent history |
| `!broadcast <message>` | Messages all customers (max 50, 3s apart) |

`<number>` is the customer's number in any format (e.g. `923001234567`).

---

## How it decides things

- **New + keyword → Sales mode**: greet → content question → plan → device →
  collect name/email **or** MAC+key (depends on plan & device) → alert you.
- **Returning number → Support mode**: renew / tech support / change plan / other.
- **Trial routing by device & plan** (matches your panel/apps):
  - Bronze on Android/Firestick/Android TV → email → Downloader (code 8137617)
  - Gold on Android/Firestick/Android TV → MAC → Televisor Smart
  - Samsung/LG (any plan) → MAC → CR Player
  - iPhone/iPad (any plan) → email → IPTV Smarters Pro
- **Discounts** → fixed value message. **Adult content / unknowns** → handled by
  the Claude system prompt. **"human/refund/not working/…", anger, or the same
  question 3×** → alerts you with `!takeover`.

## Safety (anti-ban)

1–3s random delay + typing indicator before every reply, max 10 replies per
chat per minute, never sends an identical message twice in a row, broadcasts
capped at 50 with 3s gaps.

## Endpoints

| Path | Purpose |
|---|---|
| `GET /health` | Uptime + link status |
| `GET /qr` | Current QR (prefer the Railway logs' ASCII QR) |
| `GET /api/customers?key=...` | Dashboard data (password protected, CORS on) |
