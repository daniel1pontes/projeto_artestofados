FROM node:18-alpine

# Instalar dependências do sistema para PDFkit
RUN apk add --no-cache \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    python3 \
    make \
    g++

# Criar diretório da aplicação
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p data/ordens_servico logs

# Expor porta
EXPOSE 4000

# Comando de saúde
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Comando para iniciar
CMD ["npm", "start"]