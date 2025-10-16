// servidor-central/chatbot/whatsappBot.js - VERSÃO CORRIGIDA
const axios = require('axios');
const MessageHandler = require('./messageHandler');
const logger = require('../utils/logger');

class WhatsAppBot {
  constructor(onQRCodeUpdate) {
    this.instanceId = process.env.ZAPI_INSTANCE_ID;
    this.token = process.env.ZAPI_TOKEN;
    this.clientToken = process.env.ZAPI_CLIENT_TOKEN;
    this.baseUrl = `https://api.z-api.io/instances/${this.instanceId}/token/${this.token}`;
    
    this.messageHandler = new MessageHandler();
    this.isReady = false;
    this.onQRCodeUpdate = onQRCodeUpdate;
    this.qrCheckInterval = null;
  }

  async initialize() {
    try {
      logger.info('Inicializando WhatsApp Bot com Z-API...');

      const status = await this.checkConnectionStatus();
      
      if (status.connected) {
        this.isReady = true;
        logger.info('Bot já está conectado!');
        if (this.onQRCodeUpdate) {
          this.onQRCodeUpdate(null);
        }
      } else {
        await this.startQRCodePolling();
      }

      this.messageHandler.startAutoCleanup();
      logger.info('Sistema de limpeza automática iniciado');

      return true;
    } catch (error) {
      logger.error('Erro ao inicializar bot:', error);
      throw error;
    }
  }

  async checkConnectionStatus() {
    try {
      const response = await axios.get(`${this.baseUrl}/status`, {
        headers: {
          'Client-Token': this.clientToken
        }
      });

      return {
        connected: response.data.connected === true,
        status: response.data
      };
    } catch (error) {
      logger.error('Erro ao verificar status da conexão:', error.message);
      return { connected: false, status: null };
    }
  }

  async startQRCodePolling() {
    try {
      const restoreResponse = await axios.get(`${this.baseUrl}/restore-session`, {
        headers: {
          'Client-Token': this.clientToken
        }
      });

      logger.info('Sessão restaurada, aguardando QR Code...');

      this.qrCheckInterval = setInterval(async () => {
        try {
          const qrResponse = await axios.get(`${this.baseUrl}/qr-code/image`, {
            headers: {
              'Client-Token': this.clientToken
            }
          });

          if (qrResponse.data && qrResponse.data.value) {
            if (this.onQRCodeUpdate) {
              this.onQRCodeUpdate(qrResponse.data.value);
            }
            logger.info('QR Code gerado e disponível');
          }

          const status = await this.checkConnectionStatus();
          if (status.connected) {
            this.isReady = true;
            this.stopQRCodePolling();
            if (this.onQRCodeUpdate) {
              this.onQRCodeUpdate(null);
            }
            logger.info('Bot conectado com sucesso!');
          }
        } catch (error) {
          // Ignorar erros durante polling
        }
      }, 3000);

    } catch (error) {
      logger.error('Erro ao iniciar polling do QR Code:', error);
    }
  }

  stopQRCodePolling() {
    if (this.qrCheckInterval) {
      clearInterval(this.qrCheckInterval);
      this.qrCheckInterval = null;
    }
  }

  async sendText(phone, message) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/send-text`,
        {
          phone: phone,
          message: message
        },
        {
          headers: {
            'Client-Token': this.clientToken,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Erro ao enviar mensagem de texto:', error.message);
      throw error;
    }
  }

  async sendOptionList(phone, message, options) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/send-option-list`,
        {
          phone: phone,
          message: message,
          optionList: options
        },
        {
          headers: {
            'Client-Token': this.clientToken,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Erro ao enviar lista de opções:', error.message);
      throw error;
    }
  }

  async sendButtonList(phone, message, buttons) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/send-button-list`,
        {
          phone: phone,
          message: message,
          buttonList: {
            buttons: buttons
          }
        },
        {
          headers: {
            'Client-Token': this.clientToken,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Erro ao enviar botões:', error.message);
      throw error;
    }
  }

  async setupWebhook(webhookUrl) {
    try {
      await axios.put(
        `${this.baseUrl}/update-webhook-received`,
        {
          value: webhookUrl
        },
        {
          headers: {
            'Client-Token': this.clientToken,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`Webhook configurado: ${webhookUrl}`);
      return true;
    } catch (error) {
      logger.error('Erro ao configurar webhook:', error);
      return false;
    }
  }

  async handleWebhookMessage(webhookData) {
    try {
      await this.messageHandler.handle(webhookData, this);
    } catch (error) {
      logger.error('Erro ao processar webhook:', error);
    }
  }

  getStatus() {
    return {
      connected: this.isReady,
      state: this.isReady ? 'authenticated' : 'disconnected',
      pausedUsers: this.messageHandler.getPausedUsersCount()
    };
  }

  getPausedUsers() {
    return this.messageHandler.getPausedUsersList();
  }

  async clearSession() {
    try {
      logger.info('Limpando sessão do WhatsApp...');
      
      if (this.onQRCodeUpdate) {
        this.onQRCodeUpdate(null);
      }

      this.stopQRCodePolling();

      // CORREÇÃO: A Z-API usa POST para logout, não DELETE
      // E o endpoint correto é /logout-session
      try {
        await axios.post(
          `${this.baseUrl}/logout-session`,
          {},
          {
            headers: {
              'Client-Token': this.clientToken,
              'Content-Type': 'application/json'
            },
            timeout: 5000 // Timeout de 5 segundos
          }
        );
        logger.info('Logout executado na Z-API');
      } catch (logoutError) {
        // Se der erro 405 ou timeout, ignorar e continuar
        logger.warn('Aviso ao fazer logout (pode ser ignorado):', logoutError.message);
      }

      this.isReady = false;
      logger.info('Sessão limpa com sucesso!');
      return true;
    } catch (error) {
      logger.error('Erro ao limpar sessão:', error);
      // Mesmo com erro, marcar como desconectado
      this.isReady = false;
      throw error;
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