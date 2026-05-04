import { config, requireTelegramConfig } from "./config.mjs";
import { checkMarketplace } from "./monitor.mjs";
import { sendTelegramMessage, escapeHtml } from "./telegram.mjs";
import { formatProductMessage } from "./format-message.mjs";

requireTelegramConfig();

let running = false;
let sentStartupSnapshot = false;
let lastErrorMessage = "";

await safeSendTelegramMessage("OneAssembly бот запущен. Проверяю маркетплейс.");
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
    lastErrorMessage = "";
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (config.sendSnapshotOnStart && !sentStartupSnapshot) {
      sentStartupSnapshot = true;
      console.log(`[${new Date().toISOString()}] Snapshot check completed in ${durationSeconds}s. Products: ${products.length}`);
      await safeSendTelegramMessage(`📋 <b>Текущая база OneAssembly</b>\nВсего товаров: ${products.length}`);
      for (const product of products) {
        await safeSendTelegramMessage(formatProductMessage(product, { type: "new" }));
      }
    } else if (changes.length) {
      console.log(`[${new Date().toISOString()}] Check completed in ${durationSeconds}s. Products: ${products.length}. Changes: ${changes.length}`);
      for (const message of formatChanges(changes)) {
        await safeSendTelegramMessage(message);
      }
    } else {
      console.log(`[${new Date().toISOString()}] No changes. Products: ${products.length}. Duration: ${durationSeconds}s`);
    }
  } catch (error) {
    console.error(error);
    if (error.message !== lastErrorMessage) {
      lastErrorMessage = error.message;
      await safeSendTelegramMessage(`Ошибка проверки OneAssembly:\n${escapeHtml(error.message)}`);
    } else {
      console.log(`[${new Date().toISOString()}] Repeated error suppressed: ${error.message}`);
    }
  } finally {
    running = false;
  }
}

async function safeSendTelegramMessage(message) {
  try {
    await sendTelegramMessage(message);
  } catch (error) {
    console.error(`Telegram message was not delivered: ${error.message}`);
  }
}

function formatChanges(changes) {
  return changes.slice(0, 20).map((change) =>
    formatProductMessage(change.product, { type: change.type, old: change.old })
  );
}
