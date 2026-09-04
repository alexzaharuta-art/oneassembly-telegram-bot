import { config, requireTelegramConfig } from "./config.mjs";
import { checkMarketplace } from "./monitor.mjs";
import { sendTelegramMessage, getTelegramUpdates, setTelegramCommands, escapeHtml } from "./telegram.mjs";
import { formatProductMessage } from "./format-message.mjs";

requireTelegramConfig();

const snapshotCommands = new Set(["/snapshot", "/stock", "/list", "/products", "/all"]);

let running = false;
let commandPolling = false;
let restartRequested = false;
let snapshotQueued = false;
let checkQueued = false;
let lastErrorMessage = "";
let pausedUntil = 0;
let updateOffset = 0;
let nextCheckAt = 0;
let lastCheckAt = 0;
let lastSuccessAt = 0;
let lastDurationSeconds = null;
let lastProductCount = null;

console.log(
  `[${new Date().toISOString()}] Bot starting. Check interval: ${Math.round(config.checkIntervalMs / 1000)}s plus up to ${Math.round(config.checkJitterMs / 1000)}s jitter. Auth error cooldown: ${Math.round(config.authErrorCooldownMs / 60000)}m.`
);
await safeSetTelegramCommands();
await safeSendTelegramMessage("OneAssembly бот запущен. Проверяю маркетплейс.");
await runCheck();
await pollTelegramCommands();
scheduleNextCheck();
setInterval(pollTelegramCommands, config.commandPollMs);

function scheduleNextCheck() {
  const jitter = Math.floor(Math.random() * (config.checkJitterMs + 1));
  nextCheckAt = Date.now() + config.checkIntervalMs + jitter;
  setTimeout(async () => {
    nextCheckAt = 0;
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
  lastCheckAt = startedAt;

  try {
    const { products, changes, isInitialBaseline } = await checkMarketplace();
    lastErrorMessage = "";
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    lastSuccessAt = Date.now();
    lastDurationSeconds = durationSeconds;
    lastProductCount = products.length;
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
    drainQueuedActions();
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
      if (restartRequested) break;
    }
    if (restartRequested) {
      await getTelegramUpdates(updateOffset).catch((error) => {
        console.error(`Could not confirm the restart command: ${error.message}`);
      });
      setTimeout(() => process.exit(0), 750);
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
  } else if (command === "/check") {
    pausedUntil = 0;
    if (running) {
      checkQueued = true;
      await safeSendTelegramMessage("Проверка уже идёт. Новая проверка поставлена в очередь.");
      return;
    }
    await safeSendTelegramMessage("Запускаю проверку OneAssembly сейчас...");
    setTimeout(runCheck, 0);
  } else if (command === "/status") {
    await safeSendTelegramMessage(formatStatus());
  } else if (command === "/restart") {
    await safeSendTelegramMessage("Перезапускаю OneAssembly-бот. Обычно он вернётся в течение минуты.");
    console.log(`[${new Date().toISOString()}] Restart requested from the allowed Telegram chat.`);
    restartRequested = true;
  } else if (command === "/start") {
    await safeSendTelegramMessage(
      "Бот работает.\n\n" +
      "/status — состояние бота\n" +
      "/check — проверить сейчас\n" +
      "/stock — прислать весь товар\n" +
      "/restart — перезапустить бота"
    );
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
    lastCheckAt = startedAt;
    lastSuccessAt = Date.now();
    lastDurationSeconds = durationSeconds;
    lastProductCount = products.length;
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
    drainQueuedActions();
  }
}

function drainQueuedActions() {
  if (snapshotQueued) {
    snapshotQueued = false;
    checkQueued = false;
    setTimeout(sendManualSnapshot, 0);
  } else if (checkQueued) {
    checkQueued = false;
    setTimeout(runCheck, 0);
  }
}

function formatStatus() {
  const lines = ["<b>OneAssembly бот работает</b>"];
  lines.push(`Состояние: ${running ? "проверяю маркетплейс" : "ожидаю следующую проверку"}`);
  if (lastProductCount !== null) lines.push(`Товаров: ${lastProductCount}`);
  if (lastSuccessAt) {
    lines.push(`Последняя успешная проверка: ${formatAge(lastSuccessAt)}`);
    lines.push(`Время проверки: ${lastDurationSeconds}с`);
  } else if (lastCheckAt) {
    lines.push(`Последняя попытка: ${formatAge(lastCheckAt)}`);
  }
  if (nextCheckAt) lines.push(`Следующая проверка: примерно через ${formatRemaining(nextCheckAt)}`);
  if (pausedUntil > Date.now()) lines.push(`Пауза после ошибки входа: ещё ${formatRemaining(pausedUntil)}`);
  if (lastErrorMessage) lines.push(`Последняя ошибка: ${escapeHtml(lastErrorMessage)}`);
  return lines.join("\n");
}

function formatAge(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} сек. назад`;
  return `${Math.floor(seconds / 60)} мин. назад`;
}

function formatRemaining(timestamp) {
  const seconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
  if (seconds < 60) return `${seconds} сек.`;
  return `${Math.ceil(seconds / 60)} мин.`;
}

async function safeSetTelegramCommands() {
  try {
    await setTelegramCommands([
      { command: "status", description: "Состояние бота" },
      { command: "check", description: "Проверить товары сейчас" },
      { command: "stock", description: "Прислать весь товар" },
      { command: "restart", description: "Перезапустить бота" }
    ]);
  } catch (error) {
    console.error(`Could not update Telegram command menu: ${error.message}`);
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
