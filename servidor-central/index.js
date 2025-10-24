require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const WhatsAppClient = require('./chatbot/whatsappClient');
const AIHandler = require('./chatbot/aiHandler');
const GeradorOS = require('./gerador_os/geradorOS');
const PlanilhaService = require('./excel/planilha');
const PausadosRepository = require('./database/repositories/pausadosRepository');
const database = require('./database/config');
const logger = require('./utils/logger');

class ServidorCentral {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 4000;
    this.whatsappClient = null;
    this.aiHandler = new AIHandler();
    this.geradorOS = new GeradorOS();
    this.planilhaService = new PlanilhaService();
    this.pausadosRepo = new PausadosRepository();
    this.qrCodeData = null;
    this.dataDir = path.join(__dirname, 'data');
    this.osDir = path.join(this.dataDir, 'ordens_servico');
    this.botStatus = 'offline';
  }

  async initializeDatabase() {
    try {
      await database.connect();
      logger.info('✅ Banco de dados conectado com sucesso');
      return true;
    } catch (error) {
      logger.error('❌ Erro ao conectar com banco de dados:', error);
      throw error;
    }
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

  initializeWhatsApp() {
    const onQRCodeUpdate = (qrCode) => {
      this.qrCodeData = qrCode;
      if (qrCode) {
        logger.info('📱 QR Code gerado e disponível');
      } else {
        logger.info('✅ WhatsApp conectado - QR Code removido');
      }
    };

    const onReady = () => {
      this.botStatus = 'online';
      logger.info('🚀 Bot WhatsApp pronto para receber mensagens!');
    };

    const onMessage = async (messageData) => {
      try {
        await this.aiHandler.handleMessage(messageData, this.whatsappClient);
      } catch (error) {
        logger.error('Erro ao processar mensagem:', error);
      }
    };

    this.whatsappClient = new WhatsAppClient(onQRCodeUpdate, onReady, onMessage);
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
    // ==================== BOT WHATSAPP ====================
    
    this.app.get('/api/bot/status', (req, res) => {
      const whatsappStatus = this.whatsappClient ? this.whatsappClient.getStatus() : { ready: false };
      const aiStatus = this.aiHandler.getAIStatus();
      
      res.json({
        success: true,
        status: whatsappStatus.ready ? 'online' : 'offline',
        connected: whatsappStatus.ready,
        whatsapp: whatsappStatus,
        ai: aiStatus,
        sessions: this.aiHandler.getSessionCount(),
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
          message: 'QR Code não disponível.',
          qrCode: null
        });
      }
    });

    this.app.post('/api/bot/start', async (req, res) => {
      try {
        // Verificar se OpenAI está configurada
        if (!process.env.OPENAI_API_KEY) {
          return res.status(400).json({
            success: false,
            message: 'Chave da OpenAI não configurada. Adicione OPENAI_API_KEY no arquivo .env'
          });
        }

        if (this.whatsappClient) {
          logger.info('Reiniciando WhatsApp...');
          await this.whatsappClient.destroy();
          this.whatsappClient = null;
          this.qrCodeData = null;
          this.botStatus = 'offline';
        }

        this.initializeWhatsApp();
        await this.whatsappClient.initialize();
        
        logger.info('🚀 Bot iniciado com IA integrada');
        res.json({ 
          success: true, 
          message: 'Bot iniciado com sucesso! Aguarde o QR Code ou a conexão automática.' 
        });
      } catch (error) {
        logger.error('Erro ao iniciar bot:', error);
        this.qrCodeData = null;
        this.whatsappClient = null;
        this.botStatus = 'offline';
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    this.app.post('/api/bot/stop', async (req, res) => {
      try {
        if (this.whatsappClient) {
          logger.info('🛑 Parando bot...');
          await this.whatsappClient.destroy();
          this.whatsappClient = null;
          this.qrCodeData = null;
          this.botStatus = 'offline';
          
          logger.info('✅ Bot parado com sucesso');
          res.json({ 
            success: true, 
            message: 'Bot parado com sucesso' 
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

    this.app.post('/api/bot/restart', async (req, res) => {
      try {
        if (this.whatsappClient) {
          await this.whatsappClient.restart();
          res.json({ 
            success: true, 
            message: 'Bot reiniciado com sucesso' 
          });
        } else {
          res.status(400).json({ 
            success: false, 
            message: 'Bot não está em execução' 
          });
        }
      } catch (error) {
        logger.error('Erro ao reiniciar bot:', error);
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    // ==================== CONTROLE DE USUÁRIOS PAUSADOS ====================
    
    this.app.get('/api/bot/paused-users', async (req, res) => {
      try {
        const pausedUsers = await this.aiHandler.getPausedUsers();
        
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
        const userId = req.params.userId;
        const resumed = await this.aiHandler.resumeUserBot(userId);
        
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

    this.app.post('/api/bot/pause-user/:userId', async (req, res) => {
      try {
        const userId = req.params.userId;
        const { userName, hours } = req.body;
        
        await this.aiHandler.pauseUserBot(userId, userName || 'Cliente', hours || 2);
        
        res.json({ 
          success: true, 
          message: `Usuário pausado por ${hours || 2} horas` 
        });
      } catch (error) {
        logger.error('Erro ao pausar usuário:', error);
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    // ==================== CONFIGURAÇÃO DA IA ====================
    
    this.app.get('/api/ai/status', (req, res) => {
      const status = this.aiHandler.getAIStatus();
      res.json({
        success: true,
        ai: status,
        sessions: this.aiHandler.getSessionCount()
      });
    });

    this.app.post('/api/ai/test', async (req, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            success: false,
            message: 'Mensagem é obrigatória'
          });
        }

        const response = await this.aiHandler.aiConfig.generateResponse(message, {
          clienteName: 'Teste',
          userIntent: 'teste'
        });

        res.json({
          success: true,
          input: message,
          response: response
        });
      } catch (error) {
        logger.error('Erro ao testar IA:', error);
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
        
        const listaComUrls = lista.map(os => ({
          ...os,
          downloadUrl: `/files/os/${os.arquivo}`,
          previewUrl: `/api/os/preview/${os.osId}`
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

    // ==================== ESTATÍSTICAS ====================
    
    this.app.get('/api/estatisticas', async (req, res) => {
      try {
        const totalAtendimentos = await this.planilhaService.contarAtendimentos();
        const totalOS = await this.geradorOS.contarOS();
        const totalPausados = await this.pausadosRepo.contarUsuariosPausados();
        const aiStatus = this.aiHandler.getAIStatus();
        
        res.json({
          success: true,
          estatisticas: {
            totalAtendimentos,
            totalOS,
            totalPausados,
            sessionsAtivas: this.aiHandler.getSessionCount(),
            botStatus: this.botStatus,
            aiStatus: aiStatus.initialized ? 'online' : 'offline',
            ultimaAtualizacao: new Date().toISOString()
          }
        });
      } catch (error) {
        logger.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
    });

    // ==================== ROTAS DE DEBUG E SAÚDE ====================
    
    this.app.get('/api/debug/database', async (req, res) => {
      try {
        const isConnected = database.isReady();
        
        if (isConnected) {
          const result = await database.query('SELECT NOW() as timestamp');
          res.json({
            success: true,
            connected: true,
            timestamp: result.rows[0].timestamp,
            database: process.env.DB_NAME || 'artestofados'
          });
        } else {
          res.json({
            success: false,
            connected: false,
            message: 'Banco de dados não conectado'
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          connected: false,
          error: error.message
        });
      }
    });

    this.app.get('/api/debug/ai', (req, res) => {
      const aiStatus = this.aiHandler.getAIStatus();
      res.json({
        success: true,
        ai: aiStatus,
        openaiKey: process.env.OPENAI_API_KEY ? 'Configurada' : 'NÃO CONFIGURADA',
        sessions: this.aiHandler.getSessionCount()
      });
    });

    this.app.get('/api/health', (req, res) => {
      const whatsappStatus = this.whatsappClient ? this.whatsappClient.getStatus() : { ready: false };
      const aiStatus = this.aiHandler.getAIStatus();
      
      res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        version: '2.2.0',
        services: {
          database: database.isReady() ? 'connected' : 'disconnected',
          whatsapp: whatsappStatus.ready ? 'connected' : 'disconnected',
          ai: aiStatus.initialized ? 'active' : 'inactive'
        }
      });
    });

    this.app.get('/', (req, res) => {
      res.json({
        message: 'Servidor Central Artestofados com WhatsApp-Web.js e ChatGPT',
        version: '2.2.0',
        status: 'online',
        services: {
          database: database.isReady() ? 'connected' : 'disconnected',
          whatsapp: this.whatsappClient ? (this.whatsappClient.getStatus().ready ? 'connected' : 'disconnected') : 'not-initialized',
          ai: this.aiHandler.getAIStatus().initialized ? 'active' : 'inactive'
        },
        endpoints: {
          bot: '/api/bot/*',
          ai: '/api/ai/*',
          os: '/api/os/*',
          atendimentos: '/api/atendimentos',
          estatisticas: '/api/estatisticas',
          files: '/files/os/*',
          debug: '/api/debug/*'
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
      // Verificar configurações obrigatórias
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('⚠️  OPENAI_API_KEY não configurada. Configure no arquivo .env');
        logger.warn('   Exemplo: OPENAI_API_KEY=sk-sua-chave-aqui');
      }

      // Conectar ao banco de dados primeiro
      await this.initializeDatabase();
      
      await this.setupDirectories();
      this.setupMiddlewares();
      this.setupRoutes();

      // Inicializar limpezas automáticas
      this.aiHandler.startSessionCleanup();
      this.aiHandler.startPausedUsersCleanup();

      this.app.listen(this.port, '0.0.0.0', () => {
        logger.info('═══════════════════════════════════════════');
        logger.info(`🚀 SERVIDOR CENTRAL ARTESTOFADOS v2.2.0`);
        logger.info(`📡 Porta: ${this.port}`);
        logger.info(`🌐 Acessível em: http://0.0.0.0:${this.port}`);
        logger.info(`🗄️  Banco: PostgreSQL (${process.env.DB_NAME || 'artestofados'})`);
        logger.info(`🤖 IA: ${process.env.OPENAI_API_KEY ? 'ChatGPT Configurado' : 'NÃO CONFIGURADO'}`);
        logger.info(`📁 Diretório OS: ${this.osDir}`);
        logger.info('═══════════════════════════════════════════');
        logger.info('📱 WhatsApp-Web.js com IA Integrada');
        logger.info('💡 Use o botão "Conectar ao WhatsApp" na interface');
        logger.info('⚙️  Configure OPENAI_API_KEY no .env para ativar IA');
        logger.info('═══════════════════════════════════════════');
      });

    } catch (error) {
      logger.error('Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Iniciando shutdown do servidor...');
    
    if (this.whatsappClient) {
      try {
        await this.whatsappClient.destroy();
        logger.info('WhatsApp desconectado');
      } catch (error) {
        logger.error('Erro ao desconectar WhatsApp:', error);
      }
    }

    // Fechar conexão com banco de dados
    try {
      await database.close();
      logger.info('Conexão com banco de dados fechada');
    } catch (error) {
      logger.error('Erro ao fechar conexão com banco:', error);
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