// servidor-central/index.js - VERSÃO COMPLETA COM Z-API
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const WhatsAppBot = require('./chatbot/whatsappBot');
const GeradorOS = require('./gerador_os/geradorOS');
const PlanilhaService = require('./excel/planilha');
const logger = require('./utils/logger');

class ServidorCentral {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 4000;
    this.bot = null;
    this.geradorOS = new GeradorOS();
    this.planilhaService = new PlanilhaService();
    this.qrCodeData = null;
    this.dataDir = path.join(__dirname, 'data');
    this.osDir = path.join(this.dataDir, 'ordens_servico');
  }

  async setupDirectories() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.osDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'auth'), { recursive: true });
      
      logger.info('Diretórios criados/verificados');
    } catch (error) {
      logger.error('Erro ao criar diretórios:', error);
    }
  }

  setupMiddlewares() {
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type']
    }));

    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    this.app.use('/files/os', express.static(this.osDir, {
      setHeaders: (res, path) => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
      }
    }));

    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.url}`);
      next();
    });
  }

  setupRoutes() {
    // ==================== BOT WHATSAPP (Z-API) ====================
    
    this.app.get('/api/bot/status', (req, res) => {
      res.json({
        success: true,
        status: this.bot ? 'online' : 'offline',
        connected: this.bot ? this.bot.isReady : false,
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/api/bot/qrcode', (req, res) => {
      if (this.qrCodeData) {
        res.json({
          success: true,
          qrCode: this.qrCodeData,
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          success: false,
          message: 'QR Code não disponível. Inicie o bot primeiro.',
          qrCode: null
        });
      }
    });

    this.app.post('/api/bot/start', async (req, res) => {
      try {
        if (this.bot) {
          logger.info('Bot já existe, limpando sessão antiga...');
          await this.bot.clearSession();
          this.bot = null;
          this.qrCodeData = null;
        }

        const onQRCodeUpdate = (qrCode) => {
          this.qrCodeData = qrCode;
          if (qrCode) {
            logger.info('QR Code atualizado');
          } else {
            logger.info('QR Code removido - Bot conectado');
          }
        };

        this.bot = new WhatsAppBot(onQRCodeUpdate);
        await this.bot.initialize();
        
        const webhookUrl = `${process.env.SERVER_URL || 'http://177.35.39.181:4000 '}/api/bot/webhook`;
        await this.bot.setupWebhook(webhookUrl);
        
        logger.info('Bot iniciado via API - Nova sessão criada');
        res.json({ 
          success: true, 
          message: 'Bot iniciado com sucesso. Aguarde o QR Code aparecer na interface.' 
        });
      } catch (error) {
        logger.error('Erro ao iniciar bot:', error);
        this.qrCodeData = null;
        this.bot = null;
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    this.app.post('/api/bot/stop', async (req, res) => {
      try {
        if (this.bot) {
          logger.info('Parando bot e limpando sessão...');
          await this.bot.clearSession();
          this.bot = null;
          this.qrCodeData = null;
          
          logger.info('Bot desconectado e sessão limpa via API');
          res.json({ 
            success: true, 
            message: 'Bot desconectado e sessão limpa com sucesso' 
          });
        } else {
          res.json({ 
            success: false, 
            message: 'Bot não está em execução' 
          });
        }
      } catch (error) {
        logger.error('Erro ao parar bot:', error);
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    // ==================== WEBHOOK Z-API ====================
    
    this.app.post('/api/bot/webhook', async (req, res) => {
      try {
        logger.info('📥 Webhook recebido da Z-API');
        logger.info('📄 Dados recebidos:', JSON.stringify(req.body, null, 2));
        
        if (!this.bot) {
          logger.warn('⚠️ Bot não está ativo, ignorando webhook');
          return res.status(200).json({ 
            success: false, 
            message: 'Bot não está ativo' 
          });
        }

        // Verificar se é uma mensagem válida
        if (!req.body.phone || !req.body.text?.message) {
          logger.warn('⚠️ Webhook inválido - dados incompletos');
          return res.status(200).json({ 
            success: false, 
            message: 'Dados de webhook inválidos' 
          });
        }

        await this.bot.handleWebhookMessage(req.body);
        logger.info('✅ Webhook processado com sucesso');
        
        res.status(200).json({ success: true });
      } catch (error) {
        logger.error('❌ Erro ao processar webhook:', error);
        res.status(200).json({ success: false });
      }
    });

    // ==================== CONTROLE DE USUÁRIOS PAUSADOS ====================
    
    this.app.get('/api/bot/paused-users', (req, res) => {
      try {
        if (!this.bot) {
          return res.json({ 
            success: true, 
            pausedUsers: [] 
          });
        }

        const pausedUsers = this.bot.getPausedUsers();
        
        res.json({
          success: true,
          pausedUsers: pausedUsers,
          total: pausedUsers.length
        });
      } catch (error) {
        logger.error('Erro ao listar usuários pausados:', error);
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    this.app.post('/api/bot/resume-user/:userId', async (req, res) => {
      try {
        if (!this.bot) {
          return res.json({ 
            success: false, 
            message: 'Bot não está conectado' 
          });
        }

        const userId = req.params.userId;
        const resumed = this.bot.messageHandler.resumeUserBot(userId);
        
        if (resumed) {
          logger.info(`Bot reativado manualmente para usuário: ${userId}`);
          res.json({ 
            success: true, 
            message: 'Bot reativado para este usuário' 
          });
        } else {
          res.json({ 
            success: false, 
            message: 'Usuário não estava pausado' 
          });
        }
      } catch (error) {
        logger.error('Erro ao reativar usuário:', error);
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    // ==================== ATENDIMENTOS ====================
    
    this.app.get('/api/atendimentos', async (req, res) => {
      try {
        const filtros = req.query;
        const atendimentos = await this.planilhaService.getAtendimentos(filtros);
        res.json({
          success: true,
          atendimentos
        });
      } catch (error) {
        logger.error('Erro ao listar atendimentos:', error);
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    // ==================== ORDENS DE SERVIÇO ====================
    
    this.app.post('/api/os/criar', async (req, res) => {
      try {
        const dados = req.body;
        logger.info('Dados recebidos para OS:', dados);
        
        const resultado = await this.geradorOS.gerarOS(dados);
        
        logger.info(`OS criada: ${resultado.osId}`);
        logger.info(`Arquivo: ${resultado.fileName}`);
        
        const fileExists = await fs.access(resultado.filePath).then(() => true).catch(() => false);
        logger.info(`Arquivo existe: ${fileExists}`);
        
        res.json({
          success: true,
          osId: resultado.osId,
          fileName: resultado.fileName,
          filePath: resultado.filePath,
          downloadUrl: `/files/os/OS_${resultado.osId}.pdf`,
          valorTotal: resultado.valorTotal
        });
      } catch (error) {
        logger.error('Erro ao criar OS:', error);
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    this.app.get('/api/os/listar', async (req, res) => {
      try {
        const lista = await this.geradorOS.listarOS();
        
        const listaComUrls = await Promise.all(lista.map(async os => {
          const filePath = path.join(this.osDir, os.arquivo);
          const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
          
          return {
            ...os,
            downloadUrl: `/files/os/${os.arquivo}`,
            previewUrl: `/api/os/preview/${os.osId}`,
            fileExists
          };
        }));

        res.json({
          success: true,
          total: listaComUrls.length,
          ordens: listaComUrls
        });
      } catch (error) {
        logger.error('Erro ao listar OS:', error);
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    this.app.get('/api/os/buscar/:id', async (req, res) => {
      try {
        const osId = req.params.id;
        const filePath = await this.geradorOS.buscarOS(osId);
        
        res.json({
          success: true,
          osId,
          downloadUrl: `/files/os/OS_${osId}.pdf`
        });
      } catch (error) {
        logger.error('Erro ao buscar OS:', error);
        res.status(404).json({
          success: false,
          message: 'Ordem de Serviço não encontrada'
        });
      }
    });

    this.app.get('/api/os/download/:id', async (req, res) => {
      try {
        const osId = req.params.id;
        const filePath = await this.geradorOS.buscarOS(osId);
        
        logger.info(`Download solicitado para OS ${osId}: ${filePath}`);
        
        await fs.access(filePath);
        
        res.download(filePath, `OS_${osId}.pdf`, (err) => {
          if (err) {
            logger.error('Erro ao fazer download:', err);
            if (!res.headersSent) {
              res.status(500).json({
                success: false,
                message: 'Erro ao baixar arquivo'
              });
            }
          } else {
            logger.info(`Download concluído: OS_${osId}.pdf`);
          }
        });
      } catch (error) {
        logger.error('Erro no download:', error);
        res.status(404).json({
          success: false,
          message: 'Arquivo não encontrado'
        });
      }
    });

    this.app.get('/api/os/preview/:id', async (req, res) => {
      try {
        const osId = req.params.id;
        const filePath = await this.geradorOS.buscarOS(osId);
        
        const fileBuffer = await fs.readFile(filePath);
        const base64 = fileBuffer.toString('base64');
        
        res.json({
          success: true,
          osId,
          pdfBase64: base64,
          mimeType: 'application/pdf'
        });
      } catch (error) {
        res.status(404).json({
          success: false,
          message: 'Arquivo não encontrado'
        });
      }
    });

    this.app.delete('/api/os/deletar/:id', async (req, res) => {
      try {
        const osId = req.params.id;
        await this.geradorOS.deletarOS(osId);
        
        res.json({
          success: true,
          message: 'Ordem de Serviço deletada com sucesso'
        });
      } catch (error) {
        logger.error('Erro ao deletar OS:', error);
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    this.app.get('/api/debug/files', async (req, res) => {
      try {
        const files = await fs.readdir(this.osDir);
        const fileDetails = await Promise.all(files.map(async file => {
          const filePath = path.join(this.osDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        }));
        
        res.json({
          success: true,
          directory: this.osDir,
          files: fileDetails
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    this.app.get('/api/estatisticas', async (req, res) => {
      try {
        const atendimentos = await this.planilhaService.getAtendimentos();
        const ordens = await this.geradorOS.listarOS();
        
        res.json({
          success: true,
          estatisticas: {
            totalAtendimentos: atendimentos.length,
            totalOS: ordens.length,
            botStatus: this.bot ? 'online' : 'offline',
            ultimaAtualizacao: new Date().toISOString()
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    this.app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      });
    });

    this.app.get('/', (req, res) => {
      res.json({
        message: 'Servidor Central Artestofados com Z-API',
        version: '2.0.0',
        status: 'online',
        endpoints: {
          bot: '/api/bot/*',
          os: '/api/os/*',
          atendimentos: '/api/atendimentos',
          estatisticas: '/api/estatisticas',
          files: '/files/os/*'
        }
      });
    });

    this.app.use((req, res) => {
      logger.warn(`404 - Rota não encontrada: ${req.method} ${req.url}`);
      res.status(404).json({
        success: false,
        message: 'Endpoint não encontrado'
      });
    });

    this.app.use((error, req, res, next) => {
      logger.error('Erro não tratado:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    });
  }

  async start() {
    try {
      await this.setupDirectories();
      this.setupMiddlewares();
      this.setupRoutes();

      this.app.listen(this.port, '0.0.0.0', () => {
        logger.info('═══════════════════════════════════════════');
        logger.info(`🚀 SERVIDOR CENTRAL ARTESTOFADOS`);
        logger.info(`📡 Porta: ${this.port}`);
        logger.info(`🌐 Acessível em: http://0.0.0.0:${this.port}`);
        logger.info(`📁 Diretório OS: ${this.osDir}`);
        logger.info('═══════════════════════════════════════════');
        logger.info('⚡ Bot WhatsApp via Z-API');
        logger.info('💡 Use o botão "Conectar ao WhatsApp" na interface');
        logger.info('═══════════════════════════════════════════');
      });

    } catch (error) {
      logger.error('Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Iniciando shutdown do servidor...');
    
    if (this.bot) {
      try {
        await this.bot.clearSession();
        logger.info('Bot WhatsApp desconectado e sessão limpa');
      } catch (error) {
        logger.error('Erro ao desconectar bot:', error);
      }
    }
    
    logger.info('Servidor encerrado');
    process.exit(0);
  }
}

const servidor = new ServidorCentral();

process.on('SIGINT', () => {
  logger.info('Recebido SIGINT');
  servidor.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('Recebido SIGTERM');  
  servidor.shutdown();
});

process.on('uncaughtException', (error) => {
  logger.error('Erro não capturado:', error);
  servidor.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', reason);
});

servidor.start().catch(error => {
  logger.error('Falha fatal ao iniciar servidor:', error);
  process.exit(1);
});

module.exports = ServidorCentral;