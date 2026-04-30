import { config } from "./config.mjs";
import { readJson } from "./storage.mjs";
import { sendTelegramMessage } from "./telegram.mjs";
import { formatProductMessage } from "./format-message.mjs";

const products = Object.values(await readJson(config.productsFile, {}));

if (!products.length) {
  console.error("No saved products found. Wait for the bot to complete one check first.");
  process.exit(1);
}

for (const product of products) {
  await sendTelegramMessage(formatProductMessage(product, { type: "new" }));
}

console.log(`Resent ${products.length} products to Telegram.`);
