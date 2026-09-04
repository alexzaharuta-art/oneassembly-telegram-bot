import { config, requireTelegramConfig } from "./config.mjs";
import { checkMarketplace } from "./monitor.mjs";
import { sendTelegramMessage, getTelegramUpdates, escapeHtml } from "./telegram.mjs";
import { formatProductMessage } from "./format-message.mjs";

requireTelegramConfig();

const snapshotCommands = new Set(["/snapshot", "/stock", "/list", "/products", "/all"]);

let running = false;
let commandPolling = false;
let snapshotQueued = false;
let lastErrorMessage = "";
let pausedUntil = 0;
let updateOffset = 0;

console.log(
  `[${new Date().toISOString()}] Bot starting. Check interval: ${Math.round(config.checkIntervalMs / 1000)}s plus up to ${Math.round(config.checkJitterMs / 1000)}s jitter. Auth error cooldown: ${Math.round(config.authErrorCooldownMs / 60000)}m.`
);
await safeSendTelegramMessage("OneAssembly бот запущен. Проверяю маркетплейс.");
await runCheck();
await pollTelegramCommands();
scheduleNextCheck();
setInterval(pollTelegramCommands, config.commandPollMs);

function scheduleNextCheck() {
  const jitter = Math.floor(Math.random() * (config.checkJitterMs + 1));
  setTimeout(async () => {
    await runCheck();
    scheduleNextCheck();
  }, config.checkIntervalMs + jitter);
}

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
    if (snapshotQueued) {
      snapshotQueued = false;
      setTimeout(sendManualSnapshot, 0);
    }
  }
}

async function pollTelegramCommands() {
  if (commandPolling) return;
  commandPolling = true;
  try {
    const updates = await getTelegramUpdates(updateOffset);
    for (const update of updates) {
      updateOffset = Math.max(updateOffset, update.update_id + 1);
      await handleTelegramCommand(update.message);
    }
  } catch (error) {
    console.error(`Could not read Telegram commands: ${error.message}`);
  } finally {
    commandPolling = false;
  }
}

async function handleTelegramCommand(message) {
  if (!message?.text) return;
  const command = message.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  const allowedChat = String(message.chat?.id) === String(config.telegramChatId);
  console.log(`[${new Date().toISOString()}] Telegram command received: ${command || "(empty)"}. Allowed chat: ${allowedChat}.`);
  if (!allowedChat) return;

  if (snapshotCommands.has(command)) {
    await safeSendTelegramMessage("Команда принята. Готовлю полный список товаров OneAssembly...");
    if (running) {
      snapshotQueued = true;
      console.log(`[${new Date().toISOString()}] Manual snapshot queued until the current check finishes.`);
      return;
    }
    await sendManualSnapshot();
  } else if (command === "/start") {
    await safeSendTelegramMessage("Бот работает. Команда /stock пришлет полный текущий список товаров.");
  }
}

async function sendManualSnapshot() {
  if (running) {
    snapshotQueued = true;
    return;
  }
  if (Date.now() < pausedUntil) {
    await safeSendTelegramMessage("Сейчас OneAssembly просит повторный вход/CAPTCHA. Обнови сессию, потом снова отправь /snapshot.");
    return;
  }

  running = true;
  const startedAt = Date.now();
  try {
    await safeSendTelegramMessage("Делаю ручную выгрузку OneAssembly...");
    const { products } = await checkMarketplace();
    lastErrorMessage = "";
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    await safeSendTelegramMessage(`📋 <b>Ручная выгрузка OneAssembly</b>\nТоваров: ${products.length}\nПроверка: ${durationSeconds}с`);
    for (const product of products) {
      await safeSendTelegramMessage(formatProductMessage(product, { type: "new" }));
    }
  } catch (error) {
    console.error(error);
    if (isAuthError(error)) {
      pausedUntil = Date.now() + config.authErrorCooldownMs;
    }
    await safeSendTelegramMessage(`Ошибка ручной выгрузки OneAssembly:\n${escapeHtml(error.message)}`);
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
