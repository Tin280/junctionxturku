FROM node:22-slim
WORKDIR /app

COPY mcp-ryhti/package*.json ./mcp-ryhti/
RUN cd mcp-ryhti && npm ci
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

COPY backend ./backend
COPY mcp-ryhti ./mcp-ryhti


WORKDIR /app/backend
CMD ["npx", "tsx", "src/index.ts"]