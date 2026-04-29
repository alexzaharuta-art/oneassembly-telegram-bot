import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { config } from "./config.mjs";

export async function openMarketplace({ headed = false } = {}) {
  await mkdir(config.dataDir, { recursive: true });
  await restoreStorageStateFromEnv();
  const browser = await chromium.launch({ headless: headed ? false : config.headless });
  const contextOptions = {};
  if (existsSync(config.storageStateFile)) {
    contextOptions.storageState = config.storageStateFile;
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(config.marketplaceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  return { browser, context, page };
}

async function restoreStorageStateFromEnv() {
  if (!config.storageStateBase64 || existsSync(config.storageStateFile)) return;
  const body = Buffer.from(config.storageStateBase64, "base64").toString("utf8");
  JSON.parse(body);
  await writeFile(config.storageStateFile, body, "utf8");
}

export async function loginWithCredentials(page) {
  if (!config.email || !config.password) return false;

  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[autocomplete="username"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  if (!(await emailInput.count()) || !(await passwordInput.count())) return false;

  await emailInput.fill(config.email);
  await passwordInput.fill(config.password);
  await page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first().click();
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.context().storageState({ path: config.storageStateFile });
  return true;
}

export async function extractProducts(page) {
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);

  return page.evaluate((selectors) => {
    const text = (node) => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
    const attr = (node, name) => node?.getAttribute?.(name) || "";
    const configuredItems = selectors.item ? [...document.querySelectorAll(selectors.item)] : [];
    const candidates = configuredItems.length
      ? configuredItems
      : [
          ...document.querySelectorAll("main ul > li"),
          ...document.querySelectorAll('[data-testid*="product" i], [class*="product" i], article, tbody tr, [class*="card" i]')
        ];

    const products = candidates
      .map((node, index) => {
        const titleNode = selectors.title ? node.querySelector(selectors.title) : node.querySelector("h2");
        const priceNode = selectors.price
          ? node.querySelector(selectors.price)
          : [...node.querySelectorAll("p, span, div")].find((candidate) => text(candidate) === "Purchase Price:")
              ?.parentElement?.querySelector("p.font-bold");
        const rawText = text(node);
        const priceMatch = rawText.match(/(?:\$|USD\s*)\s?[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s?(?:USD|\$)/i);
        const link = node.querySelector("a[href]") || node.closest("a[href]");
        const href = link ? new URL(attr(link, "href"), location.href).href : "";
        const title = text(titleNode) || rawText.split(/(?:Purchase Price:|\$|USD|\n)/i)[0]?.trim() || `Item ${index + 1}`;
        const price = text(priceNode) || priceMatch?.[0] || "";
        const details = [...node.querySelectorAll("p.text-grey, span.text-grey")]
          .map(text)
          .filter(Boolean);
        const lotCode = details.find((value) => /^[A-Z0-9]{6,12}$/.test(value)) || "";
        const quantity = details.find((value) => /\bunits?\b/i.test(value)) || "";
        const category = details.find((value) => /^(Phones|Laptops|Tablets|Desktops|Wearables|Accessories|Other)$/i.test(value)) || "";
        const location = details.find((value) => /,\s?[A-Z]{2}\b/.test(value)) || "";
        const condition = details.find((value) => /^(New|Open Box|Used|Used - Fair|R2)$/i.test(value)) || "";
        const unitPrice = rawText.match(/\$[\d,]+(?:\.\d{1,2})?\s?\/unit/i)?.[0] || "";
        const id =
          attr(node, "data-id") ||
          attr(node, "data-testid") ||
          lotCode ||
          href ||
          `${title}|${price}`;

        return { id, title, price, unitPrice, quantity, category, location, condition, href, rawText };
      })
      .filter((item) => item.rawText && item.rawText.includes("Purchase Price:") && item.title);

    const seen = new Set();
    return products.filter((item) => {
      const key = item.id || item.rawText;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, config.selectors);
}
