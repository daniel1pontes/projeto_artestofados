const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const MessageHandler = require('./messageHandler');
const logger = require('../utils/logger');

class WhatsAppBot {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './data/auth'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    this.messageHandler = new MessageHandler();
    this.isReady = false;
  }

  async initialize() {
    try {
      logger.info('Inicializando WhatsApp Bot...');

      this.setupEventHandlers();
      await this.client.initialize();

      return true;
    } catch (error) {
      logger.error('Erro ao inicializar bot:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // QR Code para autenticação
    this.client.on('qr', (qr) => {
      logger.info('QR Code recebido. Escaneie com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    // Bot autenticado
    this.client.on('authenticated', () => {
      logger.info('✅ Bot autenticado com sucesso!');
    });

    // Bot pronto para uso
    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('🤖 Bot está pronto e conectado!');
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
    });

    // Desconectado
    this.client.on('disconnected', (reason) => {
      logger.warn('Bot desconectado:', reason);
      this.isReady = false;
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
      state: this.client.info ? 'authenticated' : 'disconnected'
    };
  }

  destroy() {
    if (this.client) {
      this.client.destroy();
      logger.info('Bot desconectado');
    }
  }
}

module.exports = WhatsAppBot;