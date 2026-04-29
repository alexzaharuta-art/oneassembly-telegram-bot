import { config } from "./config.mjs";
import { openMarketplace, loginWithCredentials, extractAllProducts } from "./oneassembly.mjs";
import { readJson, writeJson } from "./storage.mjs";

export async function checkMarketplace() {
  const { browser, context, page } = await openMarketplace();
  try {
    await loginWithCredentials(page);

    const products = await extractAllProducts(page);
    if (!products.length) {
      const title = await page.title().catch(() => "");
      const url = page.url();
      throw new Error(`No products found. Page title: ${title || "unknown"}. URL: ${url}`);
    }

    await context.storageState({ path: config.storageStateFile });

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
