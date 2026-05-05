FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV HEADLESS=true

CMD ["node", "src/bot.mjs"]
