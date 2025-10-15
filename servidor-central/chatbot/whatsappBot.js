// servidor-central/chatbot/whatsappBot.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const MessageHandler = require('./messageHandler');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class WhatsAppBot {
  constructor(onQRCodeUpdate) {
    this.client = null;
    this.messageHandler = new MessageHandler();
    this.isReady = false;
    this.onQRCodeUpdate = onQRCodeUpdate;
    this.authPath = path.join(__dirname, '../data/auth');
  }

  async initialize() {
    try {
      logger.info('Inicializando WhatsApp Bot...');

      // Criar novo cliente
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.authPath
        }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      });

      this.setupEventHandlers();
      
      // Iniciar limpeza automática de pausas expiradas
      this.messageHandler.startAutoCleanup();
      logger.info('Sistema de limpeza automática iniciado');
      
      await this.client.initialize();

      return true;
    } catch (error) {
      logger.error('Erro ao inicializar bot:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // QR Code para autenticação - GERAR COMO IMAGEM
    this.client.on('qr', async (qr) => {
      try {
        logger.info('QR Code recebido. Gerando imagem...');
        
        // Gerar QR Code como Data URL (base64)
        const qrCodeDataURL = await qrcode.toDataURL(qr, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 300,
          margin: 2
        });

        // Enviar para o servidor através do callback
        if (this.onQRCodeUpdate) {
          this.onQRCodeUpdate(qrCodeDataURL);
        }

        logger.info('✅ QR Code gerado e disponível na interface');
      } catch (error) {
        logger.error('Erro ao gerar QR Code:', error);
      }
    });

    // Bot autenticado
    this.client.on('authenticated', () => {
      logger.info('✅ Bot autenticado com sucesso!');
      
      // Limpar QR Code após autenticação
      if (this.onQRCodeUpdate) {
        this.onQRCodeUpdate(null);
      }
    });

    // Bot pronto para uso
    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('🤖 Bot está pronto e conectado!');
      
      // Limpar QR Code
      if (this.onQRCodeUpdate) {
        this.onQRCodeUpdate(null);
      }
    });

    // Receber mensagens
    this.client.on('message', async (message) => {
      try {
        await this.messageHandler.handle(message, this.client);
      } catch (error) {
        logger.error('Erro ao processar mensagem:', error);
        await message.reply('Desculpe, ocorreu um erro. Tente novamente.');
      }
    });

    // Erros de autenticação
    this.client.on('auth_failure', (error) => {
      logger.error('Falha na autenticação:', error);
      
      // Limpar QR Code em caso de falha
      if (this.onQRCodeUpdate) {
        this.onQRCodeUpdate(null);
      }
    });

    // Desconectado
    this.client.on('disconnected', (reason) => {
      logger.warn('Bot desconectado:', reason);
      this.isReady = false;
      
      // Limpar QR Code
      if (this.onQRCodeUpdate) {
        this.onQRCodeUpdate(null);
      }
    });
  }

  async sendMessage(number, message) {
    try {
      const chatId = `${number}@c.us`;
      await this.client.sendMessage(chatId, message);
      return true;
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      return false;
    }
  }

  getStatus() {
    return {
      connected: this.isReady,
      state: this.client && this.client.info ? 'authenticated' : 'disconnected',
      pausedUsers: this.messageHandler.getPausedUsersCount()
    };
  }

  getPausedUsers() {
    return this.messageHandler.getPausedUsersList();
  }

  async clearSession() {
    try {
      logger.info('Limpando sessão do WhatsApp...');
      
      // Limpar QR Code
      if (this.onQRCodeUpdate) {
        this.onQRCodeUpdate(null);
      }

      // Destruir cliente se existir
      if (this.client) {
        try {
          await this.client.destroy();
          logger.info('Cliente destruído');
        } catch (error) {
          logger.warn('Erro ao destruir cliente:', error);
        }
        this.client = null;
      }

      this.isReady = false;

      // Deletar pasta de autenticação
      if (fs.existsSync(this.authPath)) {
        logger.info('Deletando pasta de autenticação:', this.authPath);
        await this.deleteDirectory(this.authPath);
        logger.info('✅ Sessão limpa com sucesso!');
      }

      return true;
    } catch (error) {
      logger.error('Erro ao limpar sessão:', error);
      throw error;
    }
  }

  async deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          await this.deleteDirectory(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
      
      fs.rmdirSync(dirPath);
    }
  }

  async destroy() {
    try {
      await this.clearSession();
      logger.info('Bot desconectado e sessão limpa');
    } catch (error) {
      logger.error('Erro ao destruir bot:', error);
    }
  }
}

module.exports = WhatsAppBot;