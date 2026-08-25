FROM node:20-slim

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

COPY backend ./backend
COPY frontend ./frontend

ENV PORT=3000
ENV DB_PATH=/data/fazenda.db
EXPOSE 3000

CMD ["node", "backend/src/server.js"]
