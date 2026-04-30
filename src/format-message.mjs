import { config } from "./config.mjs";
import { escapeHtml } from "./telegram.mjs";

export function formatProductMessage(product, { type = "new", old } = {}) {
  const href = product.href || config.marketplaceUrl;
  const title = `<a href="${escapeHtml(href)}">${escapeHtml(product.title)}</a>`;
  const heading = type === "new" ? "🆕 <b>НОВЫЙ ЛОТ!</b>" : "💸 <b>ИЗМЕНЕНИЕ ЦЕНЫ!</b>";
  const sku = product.sku || product.id || "-";
  const quantity = normalizeQuantity(product.quantity);
  const condition = product.condition || "-";
  const location = product.location || "-";
  const price = product.price || "-";
  const oldPrice = old?.price && old.price !== product.price ? ` ← было ${escapeHtml(old.price)}` : "";
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
