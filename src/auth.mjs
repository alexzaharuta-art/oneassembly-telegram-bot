import { config } from "./config.mjs";
import { loginWithCredentials, openMarketplace } from "./oneassembly.mjs";

const { browser, context, page } = await openMarketplace({ headed: true });

console.log("Browser opened. Log in to OneAssembly if needed.");
console.log("After marketplace loads, return here and press Enter.");

await loginWithCredentials(page);

process.stdin.setEncoding("utf8");
process.stdin.resume();
process.stdin.once("data", async () => {
  await context.storageState({ path: config.storageStateFile });
  await browser.close();
  console.log(`Session saved to ${config.storageStateFile}`);
  process.exit(0);
});
