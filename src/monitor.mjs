import { config } from "./config.mjs";
import { openMarketplace, loginWithCredentials, extractAllProducts, saveStorageState } from "./oneassembly.mjs";
import { readJson, writeJson } from "./storage.mjs";

export async function checkMarketplace() {
  const { browser, context, page } = await openMarketplace();
  page.setDefaultTimeout(config.checkTimeoutMs);
  page.setDefaultNavigationTimeout(config.checkTimeoutMs);
  try {
    await withTimeout(loginWithCredentials(page), config.checkTimeoutMs, "Проверка входа зависла и была остановлена");

    const products = await withTimeout(
      extractAllProducts(page),
      config.checkTimeoutMs,
      "Проверка маркетплейса зависла и была остановлена"
    );
    if (!products.length) {
      const title = await page.title().catch(() => "");
      const url = page.url();
      if (/login\.oneassembly\.com|recaptcha\.net|auth0\.com/i.test(url)) {
        throw new Error("OneAssembly открыл страницу входа вместо маркетплейса. Обнови сессию: npm run auth, затем npm run print-session-env и замени ONEASSEMBLY_STORAGE_STATE_BASE64 в Railway.");
      }
      throw new Error(`No products found. Page title: ${title || "unknown"}. URL: ${url}`);
    }

    await withTimeout(saveStorageState(context), 15000, "Сохранение сессии заняло слишком много времени").catch((error) => {
      console.warn(`Could not save browser session: ${error.message}`);
    });

    const current = Object.fromEntries(products.map((product) => [product.id, product]));
    const previous = await readJson(config.productsFile, null);
    const isInitialBaseline = !previous;
    const changes = previous ? findNewOrRepricedProducts(previous, current) : [];

    await writeJson(config.productsFile, current);
    return { products, changes, isInitialBaseline };
  } finally {
    await withTimeout(browser.close(), 15000, "Браузер не закрылся за 15 секунд").catch((error) => {
      console.warn(error.message);
    });
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

function findNewOrRepricedProducts(previous, current) {
  const changes = [];
  for (const [id, product] of Object.entries(current)) {
    const old = previous[id];
    if (!old) {
      changes.push({ type: "new", product });
      continue;
    }
    if (old.price !== product.price || old.unitPrice !== product.unitPrice) {
      changes.push({ type: "price", product, old });
    }
  }
  return changes;
}
