import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await loadDotEnv(join(root, ".env"));

export const config = {
  root,
  dataDir: resolveFromRoot(env("BOT_DATA_DIR", "./data")),
  storageStateFile: join(resolveFromRoot(env("BOT_DATA_DIR", "./data")), "oneassembly-session.json"),
  productsFile: join(resolveFromRoot(env("BOT_DATA_DIR", "./data")), "products.json"),
  telegramToken: env("TELEGRAM_BOT_TOKEN"),
  telegramChatId: env("TELEGRAM_CHAT_ID"),
  marketplaceUrl: env("MARKETPLACE_URL", "https://app.oneassembly.com/buyer/dashboard/marketplace"),
  checkIntervalMs: numberEnv("CHECK_INTERVAL_MS", 180000),
  sendSnapshotOnStart: env("SEND_SNAPSHOT_ON_START", "false") === "true",
  headless: env("HEADLESS", "true") !== "false",
  email: env("ONEASSEMBLY_EMAIL"),
  password: env("ONEASSEMBLY_PASSWORD"),
  storageStateBase64: env("ONEASSEMBLY_STORAGE_STATE_BASE64"),
  selectors: {
    item: env("ITEM_SELECTOR"),
    title: env("TITLE_SELECTOR"),
    price: env("PRICE_SELECTOR")
  }
};

export function requireTelegramConfig() {
  const missing = [];
  if (!config.telegramToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.telegramChatId) missing.push("TELEGRAM_CHAT_ID");
  if (missing.length) {
    throw new Error(`Missing required Telegram settings: ${missing.join(", ")}`);
  }
}

async function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const body = await readFile(path, "utf8");
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(rawValue.trim());
  }
}

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveFromRoot(value) {
  return value.startsWith("/") ? value : join(root, value);
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
