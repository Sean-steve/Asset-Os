FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
COPY openapi ./openapi
RUN npm run build
USER node
EXPOSE 3001
CMD ["node","dist/server.js"]
