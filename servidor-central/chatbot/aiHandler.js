const AIConfig = require('../config/aiConfig');
const PlanilhaService = require('../excel/planilha');
const PausadosRepository = require('../database/repositories/pausadosRepository');
const CalendarService = require('../google_calendar/calendar');
const logger = require('../utils/logger');

class AIHandler {
  constructor() {
    this.aiConfig = new AIConfig();
    this.planilhaService = new PlanilhaService();
    this.pausadosRepo = new PausadosRepository();
    this.calendarService = new CalendarService();
    this.userSessions = new Map();
    this.responseQueue = new Map(); // Para evitar respostas duplicadas
  }

  async handleMessage(messageData, whatsappClient) {
    try {
      const { from, body, contact } = messageData;
      const userId = from.replace('@c.us', '');
      
      logger.info(`💬 Mensagem recebida de ${contact.name}: ${body}`);

      // Verificar se é uma resposta automática em processamento
      if (this.responseQueue.has(userId)) {
        logger.info(`⏳ Resposta em processamento para ${userId}, ignorando mensagem`);
        return;
      }

      // Verificar se usuário está pausado
      const pausaInfo = await this.pausadosRepo.verificarUsuarioPausado(userId);
      if (pausaInfo.pausado) {
        logger.info(`⏸️ Usuário ${contact.name} está pausado. Tempo restante: ${pausaInfo.minutosRestantes} min`);
        return;
      }

      // Comandos especiais
      if (this.isSpecialCommand(body)) {
        await this.handleSpecialCommand(body, userId, contact.name, whatsappClient);
        return;
      }

      // Marcar como processando
      this.responseQueue.set(userId, true);

      try {
        await this.processAIResponse(messageData, whatsappClient);
      } finally {
        // Remover da queue após processar
        setTimeout(() => {
          this.responseQueue.delete(userId);
        }, 2000); // 2 segundos de delay para evitar duplicatas
      }

    } catch (error) {
      logger.error('Erro ao processar mensagem:', error);
      // Limpar queue em caso de erro
      const userId = messageData.from.replace('@c.us', '');
      this.responseQueue.delete(userId);
    }
  }

  async processAIResponse(messageData, whatsappClient) {
    try {
      const { from, body, contact } = messageData;
      const userId = from.replace('@c.us', '');

      // Obter ou criar sessão do usuário
      let session = this.userSessions.get(userId);
      if (!session) {
        session = {
          startTime: new Date(),
          messages: [],
          clientInfo: {
            name: contact.name,
            phone: contact.number,
            userId: userId
          },
          intent: null,
          context: {}
        };
        this.userSessions.set(userId, session);
      }

      // Adicionar mensagem ao histórico
      session.messages.push({
        timestamp: new Date(),
        message: body,
        type: 'user'
      });

      // Manter apenas as últimas 10 mensagens para contexto
      if (session.messages.length > 10) {
        session.messages = session.messages.slice(-10);
      }

      // Analisar intenção se ainda não foi definida
      if (!session.intent) {
        session.intent = await this.aiConfig.analyzeIntent(body);
        logger.info(`🎯 Intenção identificada para ${contact.name}: ${session.intent}`);
      }

      // Preparar contexto para a IA
      const context = {
        clienteName: contact.name,
        userIntent: session.intent,
        previousMessages: this.buildMessageHistory(session.messages),
        sessionData: session.context
      };

      // Gerar resposta da IA
      const aiResponse = await this.aiConfig.generateResponse(body, context);

      // Verificar se a resposta contém ações especiais
      const processedResponse = await this.processResponseActions(aiResponse, session, userId);

      // Enviar resposta
      await whatsappClient.sendMessage(from, processedResponse);
      
      // Adicionar resposta ao histórico
      session.messages.push({
        timestamp: new Date(),
        message: processedResponse,
        type: 'ai'
      });

      // Marcar como lida
      await whatsappClient.markAsRead(from);

      logger.info(`🤖 IA respondeu para ${contact.name}`);

    } catch (error) {
      logger.error('Erro ao processar resposta da IA:', error);
      
      // Resposta de fallback
      const fallbackMessage = `Desculpe, ${messageData.contact.name}! 😅\n\nTive um probleminha técnico, mas nossa equipe irá retornar seu contato em breve.\n\n📞 Para urgências: ${process.env.EMPRESA_TELEFONE || '(83) 3241-1234'}`;
      
      try {
        await whatsappClient.sendMessage(messageData.from, fallbackMessage);
      } catch (sendError) {
        logger.error('Erro ao enviar mensagem de fallback:', sendError);
      }
    }
  }

  async processResponseActions(response, session, userId) {
    // Verificar se a resposta contém indicadores de ações
    let processedResponse = response;

    // Detectar solicitação de agendamento
    if (this.detectSchedulingIntent(response)) {
      session.context.needsScheduling = true;
      processedResponse += '\n\n📅 Nossa equipe entrará em contato para confirmar o melhor horário!';
    }

    // Detectar coleta de dados para atendimento
    if (this.detectDataCollection(response)) {
      session.context.collectingData = true;
    }

    // Salvar atendimento se tiver informações suficientes
    if (this.shouldSaveAtendimento(session)) {
      await this.saveAtendimento(session);
    }

    return processedResponse;
  }

  detectSchedulingIntent(response) {
    const schedulingKeywords = [
      'agendar', 'visita', 'reunião', 'horário', 
      'data', 'quando', 'disponibilidade'
    ];
    
    return schedulingKeywords.some(keyword => 
      response.toLowerCase().includes(keyword)
    );
  }

  detectDataCollection(response) {
    const dataKeywords = [
      'nome', 'telefone', 'endereço', 'detalhes',
      'informações', 'dados'
    ];
    
    return dataKeywords.some(keyword => 
      response.toLowerCase().includes(keyword)
    );
  }

  shouldSaveAtendimento(session) {
    // Salvar atendimento se:
    // 1. Intenção foi identificada
    // 2. Houve pelo menos 3 mensagens de interação
    // 3. Ainda não foi salvo
    
    return session.intent && 
           session.intent !== 'cumprimento' &&
           session.messages.length >= 3 &&
           !session.context.atendimentoSalvo;
  }

  async saveAtendimento(session) {
    try {
      const atendimentoData = {
        nome: session.clientInfo.name,
        telefone: session.clientInfo.phone,
        servico: this.mapIntentToService(session.intent),
        detalhes: this.buildServiceDetails(session),
        dataAtendimento: session.startTime,
        status: 'Em andamento'
      };

      await this.planilhaService.addAtendimento(atendimentoData);
      session.context.atendimentoSalvo = true;
      
      logger.info(`💾 Atendimento salvo para ${session.clientInfo.name}`);
    } catch (error) {
      logger.error('Erro ao salvar atendimento:', error);
    }
  }

  mapIntentToService(intent) {
    const intentMap = {
      'fabricacao': 'Fabricação de Móveis',
      'reforma': 'Reforma de Móveis',
      'orcamento': 'Solicitação de Orçamento',
      'agendamento': 'Agendamento de Visita',
      'duvida': 'Dúvidas Gerais'
    };
    
    return intentMap[intent] || 'Atendimento Geral';
  }

  buildServiceDetails(session) {
    const messages = session.messages
      .filter(msg => msg.type === 'user')
      .map(msg => msg.message)
      .join(' | ');
    
    return `Intenção: ${session.intent} | Conversas: ${messages.substring(0, 500)}`;
  }

  buildMessageHistory(messages) {
    return messages
      .slice(-5) // Últimas 5 mensagens
      .map(msg => `${msg.type}: ${msg.message}`)
      .join('\n');
  }

  isSpecialCommand(message) {
    const commands = ['#ativar', '#pausar', '#status', '#admin'];
    return commands.some(cmd => message.toLowerCase().includes(cmd));
  }

  async handleSpecialCommand(message, userId, userName, whatsappClient) {
    const command = message.toLowerCase().trim();

    switch (command) {
      case '#ativar':
        const reativado = await this.pausadosRepo.reativarUsuario(userId);
        const reativarMsg = reativado 
          ? '✅ Bot reativado com sucesso!\n\nO atendimento automático está funcionando novamente.'
          : 'ℹ️ O bot já está ativo para este chat.';
        
        await whatsappClient.sendMessage(`${userId}@c.us`, reativarMsg);
        break;

      case '#status':
        const aiStatus = this.aiConfig.getStatus();
        const statusMsg = `🤖 *Status do Sistema*\n\n` +
          `IA: ${aiStatus.initialized ? '✅ Ativa' : '❌ Inativa'}\n` +
          `Modelo: ${aiStatus.model}\n` +
          `Max Tokens: ${aiStatus.maxTokens}`;
        
        await whatsappClient.sendMessage(`${userId}@c.us`, statusMsg);
        break;

      default:
        logger.warn(`Comando desconhecido: ${command}`);
    }
  }

  async pauseUserBot(userId, userName, hours = 2) {
    try {
      await this.pausadosRepo.pausarUsuario(userId, userName, hours);
      logger.info(`Bot pausado para ${userName} por ${hours} horas`);
    } catch (error) {
      logger.error('Erro ao pausar usuário:', error);
    }
  }

  async getPausedUsers() {
    try {
      return await this.pausadosRepo.listarUsuariosPausados();
    } catch (error) {
      logger.error('Erro ao listar usuários pausados:', error);
      return [];
    }
  }

  async resumeUserBot(userId) {
    try {
      return await this.pausadosRepo.reativarUsuario(userId);
    } catch (error) {
      logger.error('Erro ao reativar usuário:', error);
      return false;
    }
  }

  // Limpeza de sessões antigas
  startSessionCleanup() {
    setInterval(() => {
      const now = new Date();
      const maxAge = 24 * 60 * 60 * 1000; // 24 horas

      for (const [userId, session] of this.userSessions.entries()) {
        if (now - session.startTime > maxAge) {
          this.userSessions.delete(userId);
          logger.info(`🧹 Sessão limpa para usuário: ${userId}`);
        }
      }
    }, 60 * 60 * 1000); // Executa a cada 1 hora
  }

  // Limpeza de pausas expiradas
  startPausedUsersCleanup() {
    setInterval(async () => {
      try {
        const removed = await this.pausadosRepo.limparPausasExpiradas();
        if (removed > 0) {
          logger.info(`🧹 ${removed} pausas expiradas removidas`);
        }
      } catch (error) {
        logger.error('Erro na limpeza de pausas:', error);
      }
    }, 10 * 60 * 1000); // A cada 10 minutos
  }

  getSessionCount() {
    return this.userSessions.size;
  }

  getAIStatus() {
    return this.aiConfig.getStatus();
  }
}

module.exports = AIHandler;