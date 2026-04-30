import { config, requireTelegramConfig } from "./config.mjs";
import { checkMarketplace } from "./monitor.mjs";
import { sendTelegramMessage, escapeHtml } from "./telegram.mjs";
import { formatProductMessage } from "./format-message.mjs";

requireTelegramConfig();

let running = false;
let sentStartupSnapshot = false;

await sendTelegramMessage("OneAssembly бот запущен. Проверяю маркетплейс.");
await runCheck();
setInterval(runCheck, config.checkIntervalMs);

async function runCheck() {
  if (running) return;
  running = true;

  try {
    const { products, changes } = await checkMarketplace();
    if (config.sendSnapshotOnStart && !sentStartupSnapshot) {
      sentStartupSnapshot = true;
      await sendTelegramMessage(`📋 <b>Текущая база OneAssembly</b>\nВсего товаров: ${products.length}`);
      for (const product of products) {
        await sendTelegramMessage(formatProductMessage(product, { type: "new" }));
      }
    } else if (changes.length) {
      for (const message of formatChanges(changes)) {
        await sendTelegramMessage(message);
      }
    } else {
      console.log(`[${new Date().toISOString()}] No changes. Products: ${products.length}`);
    }
  } catch (error) {
    console.error(error);
    await sendTelegramMessage(`Ошибка проверки OneAssembly:\n${escapeHtml(error.message)}`).catch(console.error);
  } finally {
    running = false;
  }
}

function formatChanges(changes) {
  return changes.slice(0, 20).map((change) =>
    formatProductMessage(change.product, { type: change.type, old: change.old })
  );
}
