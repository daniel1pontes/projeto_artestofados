FROM node:18-alpine

# Instalar dependências para Electron em modo web
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos
COPY package*.json ./
COPY *.html ./
COPY *.css ./
COPY *.js ./
COPY build/ ./build/

# Instalar http-server para servir arquivos estáticos
RUN npm install -g http-server

# Expor porta
EXPOSE 3000

# Comando de saúde
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Servir arquivos estáticos
CMD ["http-server", ".", "-p", "3000", "-a", "0.0.0.0"]