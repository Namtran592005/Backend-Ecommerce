FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db
COPY seed-admin.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Tự seed admin (admin@example.com) nếu chưa có rồi chạy server
CMD ["sh", "-c", "node seed-admin.js && node src/server.js"]
