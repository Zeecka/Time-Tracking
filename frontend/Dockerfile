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

# Bake the API URL at build time (can be overridden)
ARG REACT_APP_API_URL=/api/v1
ENV REACT_APP_API_URL=$REACT_APP_API_URL

# Optional override of the JS export template
ARG REACT_APP_EXPORT_JS_TEMPLATE
ENV REACT_APP_EXPORT_JS_TEMPLATE=$REACT_APP_EXPORT_JS_TEMPLATE

# OIDC / OAuth2 — all optional; leave empty to build without authentication
ARG REACT_APP_OIDC_AUTHORITY
ENV REACT_APP_OIDC_AUTHORITY=$REACT_APP_OIDC_AUTHORITY

ARG REACT_APP_OIDC_CLIENT_ID
ENV REACT_APP_OIDC_CLIENT_ID=$REACT_APP_OIDC_CLIENT_ID

ARG REACT_APP_OIDC_REDIRECT_URI
ENV REACT_APP_OIDC_REDIRECT_URI=$REACT_APP_OIDC_REDIRECT_URI

ARG REACT_APP_OIDC_SCOPE
ENV REACT_APP_OIDC_SCOPE=$REACT_APP_OIDC_SCOPE

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
