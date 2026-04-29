import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.mjs";
import { writeJson } from "./storage.mjs";
import { escapeHtml, sendTelegramMessage } from "./telegram.mjs";

const html = await readFile(join(config.dataDir, "debug-marketplace.html"), "utf8");
const products = parseMarketplaceHtml(html);

if (!products.length) {
  console.error("No products found in data/debug-marketplace.html. Run npm run debug first.");
  process.exit(1);
}

await writeJson(
  config.productsFile,
  Object.fromEntries(products.map((product) => [product.id, product]))
);

const messages = chunkMessages(formatProducts(products), 3600);
for (const message of messages) {
  await sendTelegramMessage(message);
}

console.log(`Sent ${products.length} products to Telegram and saved baseline.`);

function parseMarketplaceHtml(body) {
  const blocks = [...body.matchAll(/<li><button[\s\S]*?<\/button><\/li>/g)].map((match) => match[0]);
  return blocks.map(parseProductBlock).filter(Boolean);
}

function parseProductBlock(block, index) {
  const withoutSvg = block.replace(/<svg[\s\S]*?<\/svg>/g, "");
  const title = clean(matchFirst(withoutSvg, /<h2[^>]*>([\s\S]*?)<\/h2>/));
  const details = [...withoutSvg.matchAll(/<(?:p|span)[^>]*class="[^"]*\btext-grey\b[^"]*"[^>]*>([\s\S]*?)<\/(?:p|span)>/g)]
    .map((match) => clean(match[1]))
    .filter(Boolean);
  const price = clean(matchFirst(withoutSvg, /Purchase Price:[\s\S]*?<p[^>]*font-bold[^>]*>([\s\S]*?)<\/p>/));
  const unitPrice = clean(matchFirst(withoutSvg, /<span[^>]*>\s*(\$[\d,]+(?:\.\d{1,2})?)\s*<span[^>]*>\s*\/unit\s*<\/span>/));
  const lotCode = details.find((value) => /^[A-Z0-9]{6,12}$/.test(value)) || "";
  const quantity = details.find((value) => /\bunits?\b/i.test(value)) || "";
  const category = details.find((value) => /^(Phones|Laptops|Tablets|Desktops|Wearables|Accessories|Other)$/i.test(value)) || "";
  const location = details.find((value) => /,\s?[A-Z]{2}\b/.test(value)) || "";
  const condition = details.find((value) => /^(New|Open Box|Used|Used - Fair|R2)$/i.test(value)) || "";

  if (!title || !price) return null;

  return {
    id: lotCode || `${title}|${price}|${index}`,
    title,
    price,
    unitPrice: unitPrice ? `${unitPrice} /unit` : "",
    quantity,
    category,
    location,
    condition,
    href: "",
    rawText: clean(withoutSvg)
  };
}

function formatProducts(products) {
  const lines = [`<b>Текущие товары OneAssembly</b>\nВсего: ${products.length}`];
  products.forEach((product, index) => {
    const meta = [product.quantity, product.category, product.location, product.condition].filter(Boolean).join(" | ");
    const unit = product.unitPrice ? ` (${escapeHtml(product.unitPrice)})` : "";
    const href = product.href || config.marketplaceUrl;
    lines.push(
      `\n${index + 1}. <a href="${escapeHtml(href)}">${escapeHtml(product.title)}</a>` +
      `${meta ? `\n${escapeHtml(meta)}` : ""}` +
      `\nЦена: ${escapeHtml(product.price)}${unit}`
    );
  });
  return lines.join("\n");
}

function chunkMessages(message, maxLength) {
  const chunks = [];
  let current = "";
  for (const part of message.split(/\n(?=\d+\. )/)) {
    if (current && `${current}\n${part}`.length > maxLength) {
      chunks.push(current);
      current = part;
    } else {
      current = current ? `${current}\n${part}` : part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function matchFirst(value, pattern) {
  return value.match(pattern)?.[1] || "";
}

function clean(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'");
}
