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
      for (const message of formatChanges(changes)) {
        await sendTelegramMessage(message);
      }
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
  return changes.slice(0, 20).map(formatChange);
}

function formatChange(change) {
  const product = change.product;
  const href = product.href || config.marketplaceUrl;
  const title = `<a href="${escapeHtml(href)}">${escapeHtml(product.title)}</a>`;
  const heading = change.type === "new" ? "🆕 <b>НОВЫЙ ЛОТ!</b>" : "💸 <b>ИЗМЕНЕНИЕ ЦЕНЫ!</b>";
  const sku = product.sku || product.id || "-";
  const quantity = normalizeQuantity(product.quantity);
  const condition = product.condition || "-";
  const location = product.location || "-";
  const price = product.price || "-";
  const oldPrice = change.old?.price && change.old.price !== product.price ? ` ← было ${escapeHtml(change.old.price)}` : "";
  const unitPrice = product.unitPrice ? ` (${escapeHtml(product.unitPrice.replace(/\s*\/unit$/i, "/шт"))})` : "";

  return [
    heading,
    `📱 ${title}`,
    `📦 SKU: ${escapeHtml(sku)}`,
    `🔢 Кол-во: ${escapeHtml(quantity)}`,
    `🔤 Состояние: ${escapeHtml(condition)}`,
    `📍 Локация: ${escapeHtml(location)}`,
    `💰 США: <b>${escapeHtml(price)}</b>${unitPrice}${oldPrice}`
  ].join("\n");
}

function normalizeQuantity(value) {
  const match = String(value || "").match(/\d+/);
  if (!match) return "-";
  return `${match[0]} шт.`;
}
