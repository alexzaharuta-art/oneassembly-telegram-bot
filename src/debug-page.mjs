import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.mjs";
import { openMarketplace, loginWithCredentials, extractProducts } from "./oneassembly.mjs";

const { browser, page } = await openMarketplace({ headed: true });

try {
  await loginWithCredentials(page);
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const screenshotPath = join(config.dataDir, "debug-marketplace.png");
  const htmlPath = join(config.dataDir, "debug-marketplace.html");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(htmlPath, await page.content(), "utf8");

  const diagnostics = await page.evaluate(() => {
    const visibleText = document.body?.innerText?.replace(/\s+/g, " ").trim() || "";
    const count = (selector) => document.querySelectorAll(selector).length;
    return {
      title: document.title,
      url: location.href,
      textPreview: visibleText.slice(0, 1200),
      counts: {
        buttons: count("button"),
        links: count("a[href]"),
        articles: count("article"),
        rows: count("tbody tr"),
        cards: count('[class*="card" i]'),
        products: count('[class*="product" i], [data-testid*="product" i]'),
        grids: count('[role="grid"], [class*="grid" i]'),
        tables: count("table")
      }
    };
  });

  const products = await extractProducts(page);

  console.log(`Title: ${diagnostics.title}`);
  console.log(`URL: ${diagnostics.url}`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`HTML: ${htmlPath}`);
  console.log(`Candidate counts: ${JSON.stringify(diagnostics.counts, null, 2)}`);
  console.log(`Products extracted: ${products.length}`);
  console.log("");
  console.log("Visible text preview:");
  console.log(diagnostics.textPreview || "(empty)");
} finally {
  await browser.close();
}
