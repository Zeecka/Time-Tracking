# ── Stage 1: development image ───────────────────────────────────────────────
FROM node:20-alpine AS dev

WORKDIR /app

COPY package*.json ./
RUN npm ci

EXPOSE 3000

CMD ["npm", "start"]

# ── Stage 2: React build ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Bake the API URL and language at build time (can be overridden)
ARG REACT_APP_API_URL=/api/v1
ENV REACT_APP_API_URL=$REACT_APP_API_URL

ARG REACT_APP_LANGUAGE=en
ENV REACT_APP_LANGUAGE=$REACT_APP_LANGUAGE

RUN npm run build

# ── Stage 3: nginx static server ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder
COPY --from=builder /app/build /usr/share/nginx/html

# Custom nginx config — SPA fallback (all routes → index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
