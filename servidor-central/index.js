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
    
    // Servir arquivos estáticos (OS PDFs)
    this.app.use('/files/os', express.static(path.join(__dirname, 'data/ordens_servico')));
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

    // Iniciar bot
    this.app.post('/api/bot/start', async (req, res) => {
      try {
        if (!this.bot) {
          this.bot = new WhatsAppBot();
          await this.bot.initialize();
          logger.info('Bot iniciado via API');
          res.json({ 
            success: true, 
            message: 'Bot iniciado com sucesso. Escaneie o QR Code no terminal do servidor.' 
          });
        } else {
          res.json({ 
            success: false, 
            message: 'Bot já está em execução' 
          });
        }
      } catch (error) {
        logger.error('Erro ao iniciar bot:', error);
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

    // Pausar bot
    this.app.post('/api/bot/pause', (req, res) => {
      try {
        if (this.bot) {
          // Implementar lógica de pausa se necessário
          res.json({ 
            success: true, 
            message: 'Bot pausado' 
          });
        } else {
          res.json({ 
            success: false, 
            message: 'Bot não está em execução' 
          });
        }
      } catch (error) {
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
        const resultado = await this.geradorOS.gerarOS(dados);
        
        logger.info(`OS criada: ${resultado.osId}`);
        
        res.json({
          success: true,
          osId: resultado.osId,
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
        
        res.download(filePath, `OS_${osId}.pdf`, (err) => {
          if (err) {
            logger.error('Erro ao fazer download:', err);
            res.status(500).json({
              success: false,
              message: 'Erro ao baixar arquivo'
            });
          }
        });
      } catch (error) {
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
        const filePath = await this.geradorOS.buscarOS(osId);
        
        await fs.unlink(filePath);
        logger.info(`OS deletada: ${osId}`);
        
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
          estatisticas: '/api/estatisticas'
        }
      });
    });
  }

  async start() {
    try {
      this.setupMiddlewares();
      this.setupRoutes();

      this.app.listen(this.port, '0.0.0.0', () => {
        logger.info('═══════════════════════════════════════════');
        logger.info(`🚀 SERVIDOR CENTRAL ARTESTOFADOS`);
        logger.info(`📡 Porta: ${this.port}`);
        logger.info(`🌐 Acessível em: http://0.0.0.0:${this.port}`);
        logger.info('═══════════════════════════════════════════');
        logger.info('📱 Endpoints disponíveis:');
        logger.info(`   • Status Bot: GET /api/bot/status`);
        logger.info(`   • Iniciar Bot: POST /api/bot/start`);
        logger.info(`   • Listar OS: GET /api/os/listar`);
        logger.info(`   • Criar OS: POST /api/os/criar`);
        logger.info('═══════════════════════════════════════════');
      });

      // Inicializar bot automaticamente
      logger.info('🤖 Inicializando WhatsApp Bot...');
      this.bot = new WhatsAppBot();
      await this.bot.initialize();

    } catch (error) {
      logger.error('Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  shutdown() {
    logger.info('Encerrando servidor central...');
    if (this.bot) {
      this.bot.destroy();
    }
    process.exit(0);
  }
}

// Instanciar e iniciar servidor
const servidor = new ServidorCentral();

// Tratamento de sinais
process.on('SIGINT', () => servidor.shutdown());
process.on('SIGTERM', () => servidor.shutdown());

// Iniciar
servidor.start().catch(error => {
  logger.error('Falha fatal:', error);
  process.exit(1);
});

module.exports = ServidorCentral;