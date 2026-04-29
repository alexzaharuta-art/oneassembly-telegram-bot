FROM node:22-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm ci
RUN PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
ENV HEADLESS=true
ENV PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers

CMD ["npm", "start"]
