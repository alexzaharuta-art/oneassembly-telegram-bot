# OneAssembly Telegram Bot

Отдельный Telegram-бот для отслеживания товаров на:

```text
https://app.oneassembly.com/buyer/dashboard/marketplace
```

Проект не связан с CRM в родительской папке.

## Установка

```bash
cd oneassembly-telegram-bot
npm install
cp .env.example .env
```

Заполни `.env`:

```text
TELEGRAM_BOT_TOKEN=токен_от_BotFather
TELEGRAM_CHAT_ID=твой_chat_id
```

## Авторизация OneAssembly

Самый безопасный вариант: один раз открыть браузер и войти вручную.

```bash
npm run auth
```

Когда маркетплейс загрузится, вернись в терминал и нажми Enter. Сессия сохранится в `data/oneassembly-session.json`.

## Проверка

```bash
npm run check
```

Если бот нашёл товары, можно запускать постоянный мониторинг:

```bash
npm start
```

## Запуск на сервере

Бота лучше держать отдельной папкой/сервисом, не внутри CRM.

```bash
cd /path/to/oneassembly-telegram-bot
npm install
npm run install:browsers
cp .env.example .env
```

Заполни `.env`:

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
ONEASSEMBLY_EMAIL=...
ONEASSEMBLY_PASSWORD=...
CHECK_INTERVAL_MS=60000
HEADLESS=true
BOT_DATA_DIR=./data
```

Для постоянного запуска через `pm2`:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

Проверить состояние:

```bash
pm2 status
pm2 logs oneassembly-telegram-bot
```

Остановить:

```bash
pm2 stop oneassembly-telegram-bot
```

Если сервер на Linux и Chromium ругается на системные библиотеки, установи браузер с системными зависимостями:

```bash
PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers npx playwright install --with-deps chromium
```

Если сервер уже использует отдельный диск/volume, укажи его для данных:

```text
BOT_DATA_DIR=/data/oneassembly-bot
```

## GitHub + Railway

В GitHub загружается только код. Файлы `.env`, `data/oneassembly-session.json`, `data/products.json` и скриншоты не загружай.

1. Создай отдельный GitHub repo, например `oneassembly-telegram-bot`.
2. Залей содержимое этой папки в repo.
3. В Railway создай `New Project` -> `Deploy from GitHub repo`.
4. Выбери repo `oneassembly-telegram-bot`.
5. В Railway открой `Variables` и добавь:

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
ONEASSEMBLY_EMAIL=...
ONEASSEMBLY_PASSWORD=...
ONEASSEMBLY_STORAGE_STATE_BASE64=...
MARKETPLACE_URL=https://app.oneassembly.com/buyer/dashboard/marketplace
CHECK_INTERVAL_MS=60000
HEADLESS=true
BOT_DATA_DIR=./data
```

Чтобы получить `ONEASSEMBLY_STORAGE_STATE_BASE64` на Mac после `npm run auth`:

```bash
npm run print-session-env
```

Скопируй всю длинную строку и вставь её в Railway как значение `ONEASSEMBLY_STORAGE_STATE_BASE64`.

Если подключишь Railway Volume, лучше указать:

```text
BOT_DATA_DIR=/data/oneassembly-bot
```

Railway использует `Dockerfile`, поэтому Chromium для Playwright устанавливается внутри контейнера автоматически.

## Настройка поиска карточек

Если первая проверка пишет `No products found`, значит нужно уточнить CSS-селекторы в `.env`:

```text
ITEM_SELECTOR=
TITLE_SELECTOR=
PRICE_SELECTOR=
```

После этого снова запусти `npm run check`.
