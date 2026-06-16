// Tiny shared helpers.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Normalize any WhatsApp id / phone number to digits only ("923208512589").
export const digits = (s = "") => String(s).replace(/\D/g, "");

// Build a whatsapp-web.js chat id from a number.
export const chatIdFor = (number) => `${digits(number)}@c.us`;
