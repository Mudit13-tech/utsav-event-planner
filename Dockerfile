# Small, production-only image for Google Cloud Run.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY public ./public

# Run as the unprivileged "node" user.
USER node
EXPOSE 8080
CMD ["node", "server.js"]
