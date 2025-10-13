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
      // Criar diretórios necessários
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.osDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'auth'), { recursive: true });
      
      logger.info('Diretórios criados/verificados:');
      logger.info('- Data:', this.dataDir);
      logger.info('- OS:', this.osDir);
    } catch (error) {
      logger.error('Erro ao criar diretórios:', error);
    }
  }

  setupMiddlewares() {
    // CORS para permitir acesso de todos os clientes
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type']
    }));

    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Middleware de log para debugging
    this.app.use('/files/os', (req, res, next) => {
      logger.info(`Solicitando arquivo: ${req.url}`);
      logger.info(`Caminho completo: ${path.join(this.osDir, req.url)}`);
      next();
    });
    
    // Servir arquivos estáticos (OS PDFs) com headers corretos
    this.app.use('/files/os', express.static(this.osDir, {
      setHeaders: (res, path) => {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
      }
    }));

    // Middleware para logs de todas as requisições
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.url}`);
      next();
    });
  }

  setupRoutes() {
    // ==================== BOT WHATSAPP ====================
    
    // Obter status do bot
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

    // Iniciar bot
    this.app.post('/api/bot/start', async (req, res) => {
      try {
        if (!this.bot) {
          // Callback para atualizar QR Code
          const onQRCodeUpdate = (qrCode) => {
            this.qrCodeData = qrCode;
            logger.info('QR Code atualizado');
          };

          this.bot = new WhatsAppBot(onQRCodeUpdate);
          await this.bot.initialize();
          
          logger.info('Bot iniciado via API');
          res.json({ 
            success: true, 
            message: 'Bot iniciado com sucesso. Aguarde o QR Code aparecer na interface.' 
          });
        } else {
          res.json({ 
            success: false, 
            message: 'Bot já está em execução' 
          });
        }
      } catch (error) {
        logger.error('Erro ao iniciar bot:', error);
        this.qrCodeData = null;
        res.status(500).json({ 
          success: false, 
          message: error.message 
        });
      }
    });

    // Parar bot
    this.app.post('/api/bot/stop', (req, res) => {
      try {
        if (this.bot) {
          this.bot.destroy();
          this.bot = null;
          this.qrCodeData = null;
          logger.info('Bot desconectado via API');
          res.json({ 
            success: true, 
            message: 'Bot desconectado com sucesso' 
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

    // ==================== ATENDIMENTOS ====================
    
    // Listar atendimentos
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
    
    // Criar nova OS
    this.app.post('/api/os/criar', async (req, res) => {
      try {
        const dados = req.body;
        logger.info('Dados recebidos para OS:', dados);
        
        const resultado = await this.geradorOS.gerarOS(dados);
        
        logger.info(`OS criada: ${resultado.osId}`);
        logger.info(`Arquivo: ${resultado.fileName}`);
        
        // Verificar se arquivo existe
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

    // Listar todas OS
    this.app.get('/api/os/listar', async (req, res) => {
      try {
        const lista = await this.geradorOS.listarOS();
        
        // Adicionar URL de download para cada OS
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

    // Buscar OS por ID
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

    // Baixar OS
    this.app.get('/api/os/download/:id', async (req, res) => {
      try {
        const osId = req.params.id;
        const filePath = await this.geradorOS.buscarOS(osId);
        
        logger.info(`Download solicitado para OS ${osId}: ${filePath}`);
        
        // Verificar se arquivo existe
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

    // Preview de OS (retorna dados sem download)
    this.app.get('/api/os/preview/:id', async (req, res) => {
      try {
        const osId = req.params.id;
        const filePath = await this.geradorOS.buscarOS(osId);
        
        // Ler arquivo e enviar como base64 para preview
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

    // Deletar OS
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

    // ==================== TESTE DE ARQUIVOS ====================
    
    // Endpoint para listar arquivos no diretório OS
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

    // ==================== ESTATÍSTICAS ====================
    
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

    // ==================== HEALTH CHECK ====================
    
    this.app.get('/api/health', (req, res) => {
      res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Rota raiz
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Servidor Central Artestofados',
        version: '1.0.0',
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

    // Middleware de erro 404
    this.app.use((req, res) => {
      logger.warn(`404 - Rota não encontrada: ${req.method} ${req.url}`);
      res.status(404).json({
        success: false,
        message: 'Endpoint não encontrado'
      });
    });

    // Middleware de tratamento de erros
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
      });

      // Inicializar bot automaticamente com callback
      logger.info('🤖 Inicializando WhatsApp Bot...');
      const onQRCodeUpdate = (qrCode) => {
        this.qrCodeData = qrCode;
        if (qrCode) {
          logger.info('📱 QR Code gerado e disponível');
        } else {
          logger.info('✅ QR Code removido - Bot conectado');
        }
      };
      
      try {
        this.bot = new WhatsAppBot(onQRCodeUpdate);
        await this.bot.initialize();
      } catch (error) {
        logger.warn('Bot WhatsApp não pôde ser iniciado:', error.message);
        logger.info('Sistema funcionará sem bot WhatsApp');
      }

    } catch (error) {
      logger.error('Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Iniciando shutdown do servidor...');
    
    if (this.bot) {
      try {
        this.bot.destroy();
        logger.info('Bot WhatsApp desconectado');
      } catch (error) {
        logger.error('Erro ao desconectar bot:', error);
      }
    }
    
    logger.info('Servidor encerrado');
    process.exit(0);
  }
}

// Instanciar e iniciar servidor
const servidor = new ServidorCentral();

// Tratamento de sinais
process.on('SIGINT', () => {
  logger.info('Recebido SIGINT');
  servidor.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('Recebido SIGTERM');  
  servidor.shutdown();
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  logger.error('Erro não capturado:', error);
  servidor.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada não tratada:', reason);
  // Não fazer shutdown automático para promises rejeitadas
});

// Iniciar servidor
servidor.start().catch(error => {
  logger.error('Falha fatal ao iniciar servidor:', error);
  process.exit(1);
});

module.exports = ServidorCentral;