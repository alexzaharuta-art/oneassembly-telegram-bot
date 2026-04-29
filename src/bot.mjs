import { config, requireTelegramConfig } from "./config.mjs";
import { checkMarketplace } from "./monitor.mjs";
import { sendTelegramMessage, escapeHtml } from "./telegram.mjs";

requireTelegramConfig();

let running = false;

await sendTelegramMessage("OneAssembly бот запущен. Проверяю маркетплейс.");
await runCheck();
setInterval(runCheck, config.checkIntervalMs);

async function runCheck() {
  if (running) return;
  running = true;

  try {
    const { products, changes } = await checkMarketplace();
    if (changes.length) {
      await sendTelegramMessage(formatChanges(changes));
    } else {
      console.log(`[${new Date().toISOString()}] No changes. Products: ${products.length}`);
    }
  } catch (error) {
    console.error(error);
    await sendTelegramMessage(`Ошибка проверки OneAssembly:\n${escapeHtml(error.message)}`).catch(console.error);
  } finally {
    running = false;
  }
}

function formatChanges(changes) {
  const lines = [`Найдены изменения: ${changes.length}`];
  for (const change of changes.slice(0, 20)) {
    const product = change.product;
    const marker = change.type === "new" ? "Новый товар" : "Изменение";
    const priceLine = product.price ? `\nЦена: ${escapeHtml(product.price)}` : "";
    const unitLine = product.unitPrice ? ` (${escapeHtml(product.unitPrice)})` : "";
    const meta = [product.quantity, product.category, product.location, product.condition].filter(Boolean).join(" | ");
    const metaLine = meta ? `\n${escapeHtml(meta)}` : "";
    const href = product.href || config.marketplaceUrl;
    lines.push(`\n<b>${marker}</b>\n<a href="${escapeHtml(href)}">${escapeHtml(product.title)}</a>${metaLine}${priceLine}${unitLine}`);
  }
  if (changes.length > 20) lines.push(`\nИ еще: ${changes.length - 20}`);
  return lines.join("\n");
}
