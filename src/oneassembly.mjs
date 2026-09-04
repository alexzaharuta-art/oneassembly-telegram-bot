import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { config } from "./config.mjs";

export async function openMarketplace({ headed = false } = {}) {
  await mkdir(config.dataDir, { recursive: true });
  await restoreStorageStateFromEnv();
  const browser = await launchBrowser({ headed });
  const contextOptions = {};
  if (existsSync(config.storageStateFile)) {
    contextOptions.storageState = config.storageStateFile;
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(config.marketplaceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  return { browser, context, page };
}

async function launchBrowser({ headed }) {
  const baseOptions = {
    headless: headed ? false : config.headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote"
    ]
  };
  const launchOptions = [
    baseOptions,
    { ...baseOptions, channel: "chromium" }
  ];

  let lastError;
  for (let attempt = 1; attempt <= launchOptions.length; attempt += 1) {
    try {
      return await chromium.launch(launchOptions[attempt - 1]);
    } catch (error) {
      lastError = error;
      console.warn(`Browser launch attempt ${attempt} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw lastError;
}

async function restoreStorageStateFromEnv() {
  await syncStorageStateFromEnv({
    storageStateBase64: config.storageStateBase64,
    storageStateFile: config.storageStateFile
  });
}

export async function syncStorageStateFromEnv({ storageStateBase64, storageStateFile }) {
  if (!storageStateBase64) return false;

  const encodedState = storageStateBase64.trim();
  const markerFile = `${storageStateFile}.bootstrap.sha256`;
  const sourceHash = createHash("sha256").update(encodedState).digest("hex");
  const appliedHash = await readFile(markerFile, "utf8").catch(() => "");

  if (existsSync(storageStateFile) && appliedHash.trim() === sourceHash) {
    return false;
  }

  let body = "";
  try {
    body = Buffer.from(encodedState, "base64").toString("utf8");
    JSON.parse(body);
  } catch {
    throw new Error("ONEASSEMBLY_STORAGE_STATE_BASE64 в Railway заполнен неправильно. Обнови сессию на Mac через npm run auth, потом скопируй значение командой: npm run print-session-env | tail -n 1 | pbcopy");
  }

  await writeFile(storageStateFile, body, "utf8");
  await writeFile(markerFile, `${sourceHash}\n`, "utf8");
  return true;
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
  await saveStorageState(page.context());
  return true;
}

export async function saveStorageState(context) {
  try {
    await context.storageState({ path: config.storageStateFile });
  } catch (error) {
    console.warn(`Could not save browser session: ${error.message}`);
  }
}

export async function assertMarketplaceSession(page) {
  const url = page.url();
  if (/login\.oneassembly\.com|recaptcha\.net|auth0\.com/i.test(url)) {
    throw new Error("OneAssembly запросил повторный вход или reCAPTCHA. Нужно обновить сессию: запусти npm run auth на Mac, затем обнови ONEASSEMBLY_STORAGE_STATE_BASE64 в Railway.");
  }
}

export async function extractProducts(page) {
  await page
    .waitForFunction(
      () =>
        document.body?.innerText?.includes("Purchase Price:") ||
        /login\.oneassembly\.com|recaptcha\.net|auth0\.com/i.test(location.href),
      undefined,
      { timeout: 15000 }
    )
    .catch(() => {});
  await page.waitForTimeout(750);
  await assertMarketplaceSession(page);

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

        return { id, sku: lotCode, title, price, unitPrice, quantity, category, location, condition, href, rawText };
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

export async function extractAllProducts(page, { maxPages = 20 } = {}) {
  const all = [];
  const seen = new Set();
  const seenPages = new Set();

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const products = await extractProducts(page);
    const pageSignature = products.map((product) => product.id).join("|");
    if (!pageSignature || seenPages.has(pageSignature)) break;
    seenPages.add(pageSignature);

    for (const product of products) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      all.push(product);
    }

    const nextButton = page.locator('button:has-text("Next")').last();
    if (!(await nextButton.count())) break;
    if (!(await nextButton.isVisible().catch(() => false))) break;
    if (!(await nextButton.isEnabled().catch(() => false))) break;

    const firstProductText = products[0]?.rawText || "";
    await nextButton.click();
    if (firstProductText) {
      const pageChanged = await page
        .waitForFunction(
          ({ oldText, selectors }) => {
            const text = (node) => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
            const items = selectors.item
              ? [...document.querySelectorAll(selectors.item)]
              : [...document.querySelectorAll("main ul > li")];
            const first = items.find((item) => text(item).includes("Purchase Price:"));
            return first ? text(first) !== oldText : false;
          },
          { oldText: firstProductText, selectors: config.selectors },
          { timeout: 15000 }
        )
        .then(() => true)
        .catch(() => false);
      if (!pageChanged) break;
    } else {
      break;
    }
  }

  return all;
}
