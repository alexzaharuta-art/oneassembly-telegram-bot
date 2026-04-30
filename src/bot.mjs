import { config, requireTelegramConfig } from "./config.mjs";
import { checkMarketplace } from "./monitor.mjs";
import { sendTelegramMessage, escapeHtml } from "./telegram.mjs";
import { formatProductMessage } from "./format-message.mjs";

requireTelegramConfig();

let running = false;
let sentStartupSnapshot = false;
let lastErrorMessage = "";

await sendTelegramMessage("OneAssembly бот запущен. Проверяю маркетплейс.");
await runCheck();
setInterval(runCheck, config.checkIntervalMs);

async function runCheck() {
  if (running) {
    console.log(`[${new Date().toISOString()}] Previous check is still running. Skipping this tick.`);
    return;
  }
  running = true;
  const startedAt = Date.now();

  try {
    const { products, changes } = await checkMarketplace();
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (config.sendSnapshotOnStart && !sentStartupSnapshot) {
      sentStartupSnapshot = true;
      console.log(`[${new Date().toISOString()}] Snapshot check completed in ${durationSeconds}s. Products: ${products.length}`);
      await sendTelegramMessage(`📋 <b>Текущая база OneAssembly</b>\nВсего товаров: ${products.length}`);
      for (const product of products) {
        await sendTelegramMessage(formatProductMessage(product, { type: "new" }));
      }
    } else if (changes.length) {
      console.log(`[${new Date().toISOString()}] Check completed in ${durationSeconds}s. Products: ${products.length}. Changes: ${changes.length}`);
      for (const message of formatChanges(changes)) {
        await sendTelegramMessage(message);
      }
    } else {
      console.log(`[${new Date().toISOString()}] No changes. Products: ${products.length}. Duration: ${durationSeconds}s`);
    }
  } catch (error) {
    console.error(error);
    if (error.message !== lastErrorMessage) {
      lastErrorMessage = error.message;
      await sendTelegramMessage(`Ошибка проверки OneAssembly:\n${escapeHtml(error.message)}`).catch(console.error);
    } else {
      console.log(`[${new Date().toISOString()}] Repeated error suppressed: ${error.message}`);
    }
  } finally {
    running = false;
  }
}

function formatChanges(changes) {
  return changes.slice(0, 20).map((change) =>
    formatProductMessage(change.product, { type: change.type, old: change.old })
  );
}
