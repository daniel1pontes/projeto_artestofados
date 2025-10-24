FROM node:18-alpine

# Instalar dependências do sistema para PDFkit e Puppeteer
RUN apk add --no-cache \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    python3 \
    make \
    g++ \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configurar Puppeteer para usar Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Criar diretório da aplicação
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p data/ordens_servico logs whatsapp_session

# Definir permissões
RUN chown -R node:node /app

# Usar usuário não-root
USER node

# Expor porta
EXPOSE 4000

# Comando de saúde
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando para iniciar
CMD ["npm", "start"]