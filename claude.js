import Anthropic from "@anthropic-ai/sdk";
import { config, SYSTEM_PROMPT } from "./config.js";

// Only build a client if a key is configured. Without one, the bot still runs —
// open-ended questions just get the canned fallback (free testing, no API cost).
const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;
const FALLBACK = "Great question! Let me check with our technical team and get back to you shortly 😊";

// Turn stored history into a valid messages array. The history already ends
// with the customer's current message, so we don't append it again. Roles map
// to user/assistant and the array must start with a user turn.
function buildMessages(history) {
  let mapped = (history || [])
    .filter((m) => m.text && m.text.trim())
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }))
    .slice(-20);
  while (mapped.length && mapped[0].role !== "user") mapped.shift();
  return mapped;
}

/**
 * Ask Claude Haiku for a reply. `history` must end with the customer's latest
 * message. Returns the text, or a safe fallback on error.
 */
export async function askClaude(history) {
  if (!client) return FALLBACK; // no API key configured — free mode
  try {
    const messages = buildMessages(history);
    if (!messages.length) messages.push({ role: "user", content: "Hi" });
    const res = await client.messages.create({
      model: config.model,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages,
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || "Great question! Let me check with our technical team and get back to you shortly 😊";
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error("[claude] rate limited");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`[claude] API error ${err.status}: ${err.message}`);
    } else {
      console.error("[claude] error:", err.message);
    }
    return "Great question! Let me check with our technical team and get back to you shortly 😊";
  }
}
