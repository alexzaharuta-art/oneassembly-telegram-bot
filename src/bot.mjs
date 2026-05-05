import { config, requireTelegramConfig } from "./config.mjs";
import { checkMarketplace } from "./monitor.mjs";
import { sendTelegramMessage, escapeHtml } from "./telegram.mjs";
import { formatProductMessage } from "./format-message.mjs";

requireTelegramConfig();

let running = false;
let lastErrorMessage = "";
let pausedUntil = 0;

console.log(
  `[${new Date().toISOString()}] Bot starting. Check interval: ${Math.round(config.checkIntervalMs / 1000)}s. Auth error cooldown: ${Math.round(config.authErrorCooldownMs / 60000)}m.`
);
await safeSendTelegramMessage("OneAssembly бот запущен. Проверяю маркетплейс.");
await runCheck();
setInterval(runCheck, config.checkIntervalMs);

async function runCheck() {
  if (Date.now() < pausedUntil) {
    console.log(`[${new Date().toISOString()}] OneAssembly auth cooldown active. Skipping check until ${new Date(pausedUntil).toISOString()}.`);
    return;
  }
  if (running) {
    console.log(`[${new Date().toISOString()}] Previous check is still running. Skipping this tick.`);
    return;
  }
  running = true;
  const startedAt = Date.now();

  try {
    const { products, changes, isInitialBaseline } = await checkMarketplace();
    lastErrorMessage = "";
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (isInitialBaseline) {
      console.log(`[${new Date().toISOString()}] Initial baseline saved in ${durationSeconds}s. Products: ${products.length}`);
      await safeSendTelegramMessage(`📋 <b>База OneAssembly создана</b>\nЗагружено товаров: ${products.length}\nДальше буду присылать только новые товары и изменения цены.`);
      if (config.sendSnapshotOnStart) {
        console.log(`[${new Date().toISOString()}] Sending initial snapshot. Products: ${products.length}`);
        await safeSendTelegramMessage(`📋 <b>Первичная выгрузка OneAssembly</b>\nВсего товаров: ${products.length}`);
        for (const product of products) {
          await safeSendTelegramMessage(formatProductMessage(product, { type: "new" }));
        }
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
    if (isAuthError(error)) {
      pausedUntil = Date.now() + config.authErrorCooldownMs;
    }
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

function isAuthError(error) {
  return /повторный вход|recaptcha|captcha|login|auth/i.test(error.message || "");
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
