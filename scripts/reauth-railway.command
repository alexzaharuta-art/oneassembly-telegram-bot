#!/bin/bash

set -e

PROJECT_DIR="/Users/sasha/Documents/New project/oneassembly-telegram-bot"
SESSION_FILE="$PROJECT_DIR/data/oneassembly-session.json"

cd "$PROJECT_DIR"

echo "OneAssembly bot session refresh"
echo "1. Log in in the browser and complete CAPTCHA if requested."
echo "2. Wait for Marketplace to load."
echo "3. Return to this window and press Enter."
echo

npm run auth

if [ ! -s "$SESSION_FILE" ]; then
  echo "Session file was not created. Railway was not changed."
  read -r -p "Press Enter to close..."
  exit 1
fi

echo
echo "Uploading the new session to Railway..."
base64 < "$SESSION_FILE" \
  | tr -d '\n' \
  | npx --yes @railway/cli variable set ONEASSEMBLY_STORAGE_STATE_BASE64 \
      --stdin \
      --service oneassembly-telegram-bot \
      --environment production

echo
echo "Done. Railway is restarting the bot. It normally takes 2-5 minutes."
read -r -p "Press Enter to close..."
