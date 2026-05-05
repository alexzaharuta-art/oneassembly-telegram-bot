import { config, requireTelegramConfig } from "./config.mjs";

export async function sendTelegramMessage(text) {
  requireTelegramConfig();

  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
}

export async function getTelegramUpdates(offset = 0) {
  requireTelegramConfig();

  const params = new URLSearchParams({
    timeout: "0",
    allowed_updates: JSON.stringify(["message"])
  });
  if (offset) params.set("offset", String(offset));

  const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/getUpdates?${params}`);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }

  const data = JSON.parse(body);
  if (!data.ok) {
    throw new Error(`Telegram API error: ${body}`);
  }
  return data.result || [];
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
