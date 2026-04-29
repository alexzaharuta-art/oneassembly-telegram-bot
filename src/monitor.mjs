import { config } from "./config.mjs";
import { openMarketplace, loginWithCredentials, extractProducts } from "./oneassembly.mjs";
import { readJson, writeJson } from "./storage.mjs";

export async function checkMarketplace() {
  const { browser, context, page } = await openMarketplace();
  try {
    await loginWithCredentials(page);

    const products = await extractProducts(page);
    if (!products.length) {
      const title = await page.title().catch(() => "");
      const url = page.url();
      throw new Error(`No products found. Page title: ${title || "unknown"}. URL: ${url}`);
    }

    await context.storageState({ path: config.storageStateFile });

    const previous = await readJson(config.productsFile, {});
    const current = Object.fromEntries(products.map((product) => [product.id, product]));
    const changes = diffProducts(previous, current);

    await writeJson(config.productsFile, current);
    return { products, changes };
  } finally {
    await browser.close();
  }
}

function diffProducts(previous, current) {
  const changes = [];
  for (const [id, product] of Object.entries(current)) {
    const old = previous[id];
    if (!old) {
      changes.push({ type: "new", product });
      continue;
    }
    if (old.price !== product.price || old.title !== product.title) {
      changes.push({ type: "updated", product, old });
    }
  }
  return changes;
}
