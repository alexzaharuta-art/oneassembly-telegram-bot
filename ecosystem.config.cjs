module.exports = {
  apps: [
    {
      name: "oneassembly-telegram-bot",
      script: "src/bot.mjs",
      cwd: __dirname,
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PLAYWRIGHT_BROWSERS_PATH: "./.playwright-browsers"
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000
    }
  ]
};
