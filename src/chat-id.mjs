import { config } from "./config.mjs";

if (!config.telegramToken) {
  console.error("Add TELEGRAM_BOT_TOKEN to .env first.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${config.telegramToken}/getUpdates`);
const data = await response.json();

if (!data.ok) {
  console.error("Telegram returned an error:");
  console.error(data.description || JSON.stringify(data, null, 2));
  process.exit(1);
}

const chats = new Map();
for (const update of data.result || []) {
  const message = update.message || update.edited_message || update.channel_post;
  const chat = message?.chat;
  if (!chat?.id) continue;
  chats.set(chat.id, {
    id: chat.id,
    type: chat.type,
    title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "private chat"
  });
}

if (!chats.size) {
  console.log("No chat_id found yet.");
  console.log("Open Telegram, send /start to your bot, wait a few seconds, then run this again.");
  process.exit(0);
}

console.log("Found Telegram chats:");
for (const chat of chats.values()) {
  console.log(`TELEGRAM_CHAT_ID=${chat.id}  (${chat.type}: ${chat.title})`);
}
