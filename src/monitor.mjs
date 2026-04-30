import { config } from "./config.mjs";
import { openMarketplace, loginWithCredentials, extractAllProducts, saveStorageState } from "./oneassembly.mjs";
import { readJson, writeJson } from "./storage.mjs";

export async function checkMarketplace() {
  const { browser, context, page } = await openMarketplace();
  try {
    await loginWithCredentials(page);

    const products = await extractAllProducts(page);
    if (!products.length) {
      const title = await page.title().catch(() => "");
      const url = page.url();
      if (/login\.oneassembly\.com|recaptcha\.net|auth0\.com/i.test(url)) {
        throw new Error("OneAssembly открыл страницу входа вместо маркетплейса. Обнови сессию: npm run auth, затем npm run print-session-env и замени ONEASSEMBLY_STORAGE_STATE_BASE64 в Railway.");
      }
      throw new Error(`No products found. Page title: ${title || "unknown"}. URL: ${url}`);
    }

    await saveStorageState(context);

    const current = Object.fromEntries(products.map((product) => [product.id, product]));
    const previous = await readJson(config.productsFile, null);
    const changes = previous ? findNewOrRepricedProducts(previous, current) : [];

    await writeJson(config.productsFile, current);
    return { products, changes };
  } finally {
    await browser.close();
  }
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
