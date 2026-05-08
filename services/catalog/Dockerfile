FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY gateway/package*.json ./gateway/
COPY services/auth/package*.json ./services/auth/
COPY services/catalog/package*.json ./services/catalog/
COPY services/streaming/package*.json ./services/streaming/
COPY services/recommendation/package*.json ./services/recommendation/
COPY services/billing-analytics/package*.json ./services/billing-analytics/
RUN npm install --omit=dev
COPY services/catalog/ ./services/catalog/
ENV NODE_PATH=/app/node_modules
WORKDIR /app/services/catalog
EXPOSE 3002
CMD ["node", "--preserve-symlinks", "index.js"]