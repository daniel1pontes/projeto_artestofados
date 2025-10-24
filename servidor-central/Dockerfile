# Imagem base
FROM node:18-alpine AS base

# Metadados
LABEL maintainer="Artestofados <contato@artestofados.com.br>"
LABEL description="Servidor Central com WhatsApp Bot e IA"
LABEL version="2.2.0"

# Variáveis de ambiente globais
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ==============================================================================
# STAGE 1: Dependencies
# ==============================================================================
FROM base AS dependencies

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache \
    # Build tools
    python3 \
    make \
    g++ \
    # PDF generation
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    # WhatsApp Web (Puppeteer)
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    # Utilities
    curl \
    && rm -rf /var/cache/apk/*

# Copiar apenas arquivos de dependências primeiro (cache layer)
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production --no-audit --no-fund \
    && npm cache clean --force

# ==============================================================================
# STAGE 2: Production
# ==============================================================================
FROM base AS production

WORKDIR /app

# Instalar apenas dependências runtime necessárias
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg \
    curl \
    && rm -rf /var/cache/apk/*

# Copiar node_modules do stage anterior
COPY --from=dependencies /app/node_modules ./node_modules

# Copiar código fonte
COPY --chown=node:node . .

# Criar estrutura de diretórios necessários
RUN mkdir -p \
    data/ordens_servico \
    logs \
    whatsapp_session \
    database \
    && chown -R node:node /app

# Remover arquivos desnecessários
RUN rm -rf \
    .git \
    .gitignore \
    .dockerignore \
    README.md \
    *.md \
    tests \
    .vscode \
    .idea

# Expor porta da aplicação
EXPOSE 4000

# Health check robusto
HEALTHCHECK --interval=30s \
            --timeout=10s \
            --start-period=60s \
            --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

# Usar usuário não-root por segurança
USER node

# Comando para iniciar a aplicação
CMD ["node", "index.js"]

# ==============================================================================