const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const logger = require('../utils/logger');

class WhatsAppClient {
  constructor(onQRCodeUpdate, onReady, onMessage) {
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.onQRCodeUpdate = onQRCodeUpdate;
    this.onReady = onReady;
    this.onMessage = onMessage;
    this.sessionPath = './whatsapp_session';
  }

  async initialize() {
    try {
      logger.info('🚀 Inicializando WhatsApp Web...');

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'artestofados-bot',
          dataPath: this.sessionPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
          ]
        }
      });

      this.setupEventListeners();
      await this.client.initialize();

      return true;
    } catch (error) {
      logger.error('❌ Erro ao inicializar WhatsApp:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // QR Code gerado
    this.client.on('qr', async (qr) => {
      logger.info('📱 QR Code gerado');
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        if (this.onQRCodeUpdate) {
          this.onQRCodeUpdate(this.qrCode);
        }
      } catch (error) {
        logger.error('Erro ao gerar QR Code:', error);
      }
    });

    // Cliente pronto
    this.client.on('ready', () => {
      logger.info('✅ WhatsApp Web conectado e pronto!');
      this.isReady = true;
      this.qrCode = null;
      if (this.onQRCodeUpdate) {
        this.onQRCodeUpdate(null);
      }
      if (this.onReady) {
        this.onReady();
      }
    });

    // Mensagem recebida
    this.client.on('message', async (message) => {
      try {
        // Ignorar mensagens de grupos e mensagens próprias
        if (message.from.includes('@g.us') || message.fromMe) {
          return;
        }

        const contact = await message.getContact();
        const chat = await message.getChat();

        const messageData = {
          id: message.id._serialized,
          from: message.from,
          body: message.body,
          type: message.type,
          timestamp: message.timestamp,
          contact: {
            id: contact.id._serialized,
            name: contact.name || contact.pushname || 'Cliente',
            number: contact.number
          },
          chat: {
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup
          }
        };

        if (this.onMessage) {
          await this.onMessage(messageData);
        }

      } catch (error) {
        logger.error('Erro ao processar mensagem:', error);
      }
    });

    // Autenticação
    this.client.on('authenticated', () => {
      logger.info('🔐 WhatsApp autenticado');
    });

    // Falha na autenticação
    this.client.on('auth_failure', (msg) => {
      logger.error('❌ Falha na autenticação WhatsApp:', msg);
    });

    // Desconectado
    this.client.on('disconnected', (reason) => {
      logger.warn('🔌 WhatsApp desconectado:', reason);
      this.isReady = false;
    });

    // Erro
    this.client.on('error', (error) => {
      logger.error('❌ Erro no WhatsApp:', error);
    });

    // Estado da conexão mudou
    this.client.on('change_state', (state) => {
      logger.info(`🔄 Estado do WhatsApp: ${state}`);
    });
  }

  async sendMessage(chatId, message) {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp não está conectado');
      }

      await this.client.sendMessage(chatId, message);
      logger.info(`📤 Mensagem enviada para ${chatId}`);
      return true;
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
      throw error;
    }
  }

  async sendMessageWithButtons(chatId, message, buttons) {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp não está conectado');
      }

      // WhatsApp Web.js não suporta botões nativamente
      // Vamos enviar a mensagem com opções numeradas
      let messageWithOptions = message + '\n\n';
      buttons.forEach((button, index) => {
        messageWithOptions += `${index + 1}. ${button.text}\n`;
      });
      messageWithOptions += '\nDigite o número da opção desejada.';

      await this.client.sendMessage(chatId, messageWithOptions);
      logger.info(`📤 Mensagem com opções enviada para ${chatId}`);
      return true;
    } catch (error) {
      logger.error('Erro ao enviar mensagem com botões:', error);
      throw error;
    }
  }

  async sendImage(chatId, imageBuffer, caption = '') {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp não está conectado');
      }

      const media = new MessageMedia('image/jpeg', imageBuffer.toString('base64'));
      await this.client.sendMessage(chatId, media, { caption });
      logger.info(`📤 Imagem enviada para ${chatId}`);
      return true;
    } catch (error) {
      logger.error('Erro ao enviar imagem:', error);
      throw error;
    }
  }

  async getChats() {
    try {
      if (!this.isReady) {
        return [];
      }

      const chats = await this.client.getChats();
      return chats.filter(chat => !chat.isGroup);
    } catch (error) {
      logger.error('Erro ao buscar chats:', error);
      return [];
    }
  }

  async getContactInfo(contactId) {
    try {
      if (!this.isReady) {
        return null;
      }

      const contact = await this.client.getContactById(contactId);
      return {
        id: contact.id._serialized,
        name: contact.name || contact.pushname,
        number: contact.number,
        profilePicUrl: await contact.getProfilePicUrl().catch(() => null)
      };
    } catch (error) {
      logger.error('Erro ao buscar informações do contato:', error);
      return null;
    }
  }

  async markAsRead(chatId) {
    try {
      if (!this.isReady) {
        return false;
      }

      const chat = await this.client.getChatById(chatId);
      await chat.sendSeen();
      return true;
    } catch (error) {
      logger.error('Erro ao marcar como lida:', error);
      return false;
    }
  }

  async getQRCode() {
    return this.qrCode;
  }

  getStatus() {
    return {
      ready: this.isReady,
      hasQRCode: !!this.qrCode,
      state: this.client ? this.client.info : null
    };
  }

  async destroy() {
    try {
      if (this.client) {
        logger.info('🛑 Desconectando WhatsApp...');
        await this.client.destroy();
        this.isReady = false;
        this.qrCode = null;
        logger.info('✅ WhatsApp desconectado');
      }
    } catch (error) {
      logger.error('Erro ao desconectar WhatsApp:', error);
    }
  }

  async logout() {
    try {
      if (this.client) {
        logger.info('🚪 Fazendo logout do WhatsApp...');
        await this.client.logout();
        this.isReady = false;
        this.qrCode = null;
        logger.info('✅ Logout realizado');
      }
    } catch (error) {
      logger.error('Erro ao fazer logout:', error);
    }
  }

  async restart() {
    try {
      await this.destroy();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Aguarda 2 segundos
      await this.initialize();
    } catch (error) {
      logger.error('Erro ao reiniciar WhatsApp:', error);
      throw error;
    }
  }
}

module.exports = WhatsAppClient;