import fs from "fs";
import { digits } from "./util.js";

/*
  Local JSON database. Stores every customer keyed by number, with full
  conversation history. On Railway the filesystem is ephemeral (resets on
  redeploy) — for permanent storage attach a Railway volume at this path.
*/
const FILE = process.env.DB_FILE || "./data.json";

let state = { customers: {} };
try {
  if (fs.existsSync(FILE)) state = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch (e) {
  console.error("[db] failed to load, starting fresh:", e.message);
}

function persist() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("[db] write failed:", e.message);
  }
}

export const db = {
  get(number) {
    return state.customers[digits(number)] || null;
  },

  all() {
    return Object.values(state.customers);
  },

  // Create or merge a customer record.
  upsert(number, patch = {}) {
    const id = digits(number);
    const now = new Date().toISOString();
    const existing = state.customers[id];
    if (existing) {
      state.customers[id] = { ...existing, ...patch, updatedAt: now };
    } else {
      state.customers[id] = {
        number: id,
        name: "",
        email: "",
        plan: "",
        device: "",
        keyword: "",
        source: "",
        mac: "",
        deviceKey: "",
        mode: "sales",
        stage: "new",
        blocked: false,
        paused: false,
        escalatedAt: 0,
        messages: [],
        questionCounts: {},
        createdAt: now,
        updatedAt: now,
        ...patch,
      };
    }
    persist();
    return state.customers[id];
  },

  addMessage(number, role, text) {
    const id = digits(number);
    const c = state.customers[id];
    if (!c) return;
    c.messages.push({ role, text, ts: new Date().toISOString() });
    if (c.messages.length > 60) c.messages = c.messages.slice(-60); // cap history
    c.updatedAt = new Date().toISOString();
    persist();
  },

  // Count how many times a near-identical question has been asked (repeat detection).
  bumpQuestion(number, text) {
    const id = digits(number);
    const c = state.customers[id];
    if (!c) return 0;
    const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().slice(0, 60);
    if (!key) return 0;
    c.questionCounts[key] = (c.questionCounts[key] || 0) + 1;
    persist();
    return c.questionCounts[key];
  },
};
