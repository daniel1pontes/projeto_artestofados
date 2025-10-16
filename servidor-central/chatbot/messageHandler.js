// servidor-central/chatbot/messageHandler.js
const PlanilhaService = require('../excel/planilha');
const CalendarService = require('../google_calendar/calendar');
const logger = require('../utils/logger');

class MessageHandler {
  constructor() {
    this.planilhaService = new PlanilhaService();
    this.calendarService = new CalendarService();
    this.userSessions = new Map();
    this.pausedUsers = new Map();
  }

  async handle(webhookData, client) {
    try {
      // Estrutura do webhook Z-API
      const { phone, senderName, isGroup, fromMe, text, selectedRowId } = webhookData;

      // REGRA 1: IGNORAR GRUPOS
      if (isGroup) {
        logger.info(`Mensagem de grupo ignorada`);
        return;
      }
      
      // Limpar número de telefone (remover @c.us se vier)
      const userId = phone.replace('@c.us', '');
      const messageBody = selectedRowId || text?.message || '';

      logger.info(`Mensagem recebida de ${senderName}: ${messageBody}`);

      // REGRA 2: VERIFICAR SE ADMIN ENVIOU MENSAGEM
      if (fromMe) {
        this.pauseUserBot(userId, senderName);
        logger.info(`Admin respondeu no chat com ${senderName}. Bot pausado por 2h.`);
        return;
      }
      
      // VERIFICAR PAUSA GLOBAL
      if (global.botGloballyPaused) {
        logger.info(`Bot pausado globalmente. Ignorando mensagem de ${senderName}`);
        return;
      }

      // VERIFICAR SE USUÁRIO ESTÁ PAUSADO
      if (this.isUserPaused(userId)) {
        const remainingTime = this.getRemainingPauseTime(userId);
        logger.info(`Usuário ${senderName} está pausado. Tempo restante: ${remainingTime} min`);
        return;
      }

      // Processar mensagem
      let session = this.userSessions.get(userId);

      if (!session) {
        session = {
          step: 'inicio',
          data: {
            nome: senderName,
            telefone: userId,
            dataAtendimento: new Date().toISOString()
          }
        };
        this.userSessions.set(userId, session);
      }

      // COMANDOS ESPECIAIS
      if (messageBody.toLowerCase() === '#ativar') {
        const resumed = this.resumeUserBot(userId);
        if (resumed) {
          await client.sendText(userId, `✅ Bot reativado com sucesso!\n\nO atendimento automático está funcionando novamente.`);
        } else {
          await client.sendText(userId, `ℹ️ O bot já está ativo para este chat.`);
        }
        return;
      }

      // Processar fluxo
      await this.processStep(messageBody, session, client, userId);

    } catch (error) {
      logger.error('Erro ao processar mensagem:', error);
    }
  }

  // ==================== MÉTODOS DE CONTROLE DE PAUSA ====================

  pauseUserBot(userId, userName) {
    const pauseUntil = new Date();
    pauseUntil.setHours(pauseUntil.getHours() + 2);

    this.pausedUsers.set(userId, {
      pausedAt: new Date(),
      pauseUntil: pauseUntil,
      userName: userName
    });

    logger.info(`Bot pausado para ${userName} até ${pauseUntil.toLocaleString('pt-BR')}`);
  }

  resumeUserBot(userId) {
    if (this.pausedUsers.has(userId)) {
      const userData = this.pausedUsers.get(userId);
      this.pausedUsers.delete(userId);
      logger.info(`Bot reativado manualmente para ${userData.userName}`);
      return true;
    }
    return false;
  }

  isUserPaused(userId) {
    if (!this.pausedUsers.has(userId)) {
      return false;
    }

    const pauseData = this.pausedUsers.get(userId);
    const now = new Date();

    if (now >= pauseData.pauseUntil) {
      this.pausedUsers.delete(userId);
      logger.info(`Pausa expirou automaticamente para ${pauseData.userName}`);
      return false;
    }

    return true;
  }

  getRemainingPauseTime(userId) {
    if (!this.pausedUsers.has(userId)) {
      return 0;
    }

    const pauseData = this.pausedUsers.get(userId);
    const now = new Date();
    const remaining = pauseData.pauseUntil - now;
    
    return Math.ceil(remaining / (1000 * 60));
  }

  startAutoCleanup() {
    setInterval(() => {
      const now = new Date();
      let cleaned = 0;

      for (const [userId, pauseData] of this.pausedUsers.entries()) {
        if (now >= pauseData.pauseUntil) {
          this.pausedUsers.delete(userId);
          cleaned++;
          logger.info(`Limpeza automática: Pausa expirada para ${pauseData.userName}`);
        }
      }

      if (cleaned > 0) {
        logger.info(`Limpeza automática: ${cleaned} pausas expiradas removidas`);
      }
    }, 10 * 60 * 1000);
  }

  // ==================== PROCESSAMENTO DE FLUXO ====================

  async processStep(messageBody, session, client, userId) {
    switch (session.step) {
      case 'inicio':
        await this.handleInicio(session, client, userId);
        break;

      case 'aguardando_servico':
        await this.handleServico(messageBody, session, client, userId);
        break;

      case 'aguardando_agendamento':
        await this.handleAgendamento(messageBody, session, client, userId);
        break;

      case 'aguardando_data':
        await this.handleData(messageBody, session, client, userId);
        break;

      case 'finalizado':
        await this.handleInicio(session, client, userId);
        break;

      default:
        await this.handleInicio(session, client, userId);
    }
  }

  async handleInicio(session, client, userId) {
    const menuMessage = `Olá ${session.data.nome}! 👋

Bem-vindo(a) à *Artestofados*! 🛋️

Como posso ajudá-lo(a) hoje?`;

    // Enviar lista interativa de opções
    const optionList = {
      title: 'Menu de Opções',
      buttonLabel: 'Ver opções',
      options: [
        {
          id: 'orcamento',
          title: 'Solicitar orçamento',
          description: 'Receba um orçamento personalizado'
        },
        {
          id: 'agendar',
          title: 'Agendar visita',
          description: 'Agende uma visita técnica'
        },
        {
          id: 'consultar',
          title: 'Consultar pedido',
          description: 'Verifique o status do seu pedido'
        },
        {
          id: 'atendente',
          title: 'Falar com atendente',
          description: 'Fale diretamente com nossa equipe'
        }
      ]
    };

    await client.sendOptionList(userId, menuMessage, optionList);
    session.step = 'aguardando_servico';
  }

  async handleServico(messageBody, session, client, userId) {
    const opcao = messageBody.toLowerCase().trim();

    switch (opcao) {
      case 'orcamento':
      case '1':
        session.data.servico = 'Orçamento';
        
        // Enviar botões de sim/não
        await client.sendButtonList(
          userId,
          `Ótimo! Vou registrar sua solicitação de orçamento. 📋\n\nEm breve nossa equipe entrará em contato.\n\nGostaria de agendar uma visita?`,
          [
            { id: 'sim', label: 'Sim' },
            { id: 'nao', label: 'Não' }
          ]
        );
        session.step = 'aguardando_agendamento';
        break;

      case 'agendar':
      case '2':
        session.data.servico = 'Agendamento de visita';
        await client.sendText(
          userId,
          `Perfeito! Vou registrar seu agendamento. 📅\n\nPor favor, informe a data e horário desejado no formato:\nDD/MM/AAAA HH:MM\n\nExemplo: 15/10/2025 14:30`
        );
        session.step = 'aguardando_data';
        break;

      case 'consultar':
      case '3':
        session.data.servico = 'Consulta de pedido';
        await client.sendText(
          userId,
          `Para consultar seu pedido, entre em contato pelo telefone: ${process.env.EMPRESA_TELEFONE || '(83) 3241-1234'}\n\nOu aguarde que um atendente irá lhe ajudar em breve.`
        );
        await this.finalizarAtendimento(session, client, userId);
        break;

      case 'atendente':
      case '4':
        session.data.servico = 'Atendimento humano';
        await client.sendText(
          userId,
          `Um de nossos atendentes irá lhe responder em breve. 👤\n\nAguarde um momento, por favor.`
        );
        await this.finalizarAtendimento(session, client, userId);
        break;

      default:
        await client.sendText(
          userId,
          `Opção inválida. Por favor, selecione uma das opções do menu.`
        );
        await this.handleInicio(session, client, userId);
        break;
    }
  }

  async handleAgendamento(messageBody, session, client, userId) {
    const resposta = messageBody.toLowerCase().trim();

    if (resposta === 'sim' || resposta === 's') {
      await client.sendText(
        userId,
        `Por favor, informe a data e horário desejado no formato:\nDD/MM/AAAA HH:MM\n\nExemplo: 15/10/2025 14:30`
      );
      session.step = 'aguardando_data';
    } else {
      await client.sendText(
        userId,
        `Entendido! Sua solicitação foi registrada. ✅\n\nEm breve nossa equipe entrará em contato.\n\nObrigado por escolher a Artestofados! 🛋️`
      );
      await this.finalizarAtendimento(session, client, userId);
    }
  }

  async handleData(messageBody, session, client, userId) {
    const dataTexto = messageBody.trim();
    
    const regexData = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/;
    const match = dataTexto.match(regexData);

    if (match) {
      session.data.dataAgendamento = dataTexto;
      
      await client.sendText(
        userId,
        `Agendamento confirmado para: ${dataTexto} ✅\n\nSua solicitação foi registrada com sucesso!\n\nEm breve confirmaremos seu agendamento.\n\nObrigado por escolher a Artestofados! 🛋️`
      );

      try {
        await this.calendarService.createEvent({
          summary: `Visita - ${session.data.nome}`,
          description: `Cliente: ${session.data.nome}\nTelefone: ${session.data.telefone}\nServiço: ${session.data.servico}`,
          start: this.parseDateTime(dataTexto),
          attendee: session.data.nome
        });
      } catch (error) {
        logger.error('Erro ao criar evento no calendar:', error);
      }

      await this.finalizarAtendimento(session, client, userId);
    } else {
      await client.sendText(
        userId,
        `Data inválida. Por favor, use o formato: DD/MM/AAAA HH:MM\n\nExemplo: 15/10/2025 14:30`
      );
    }
  }

  async finalizarAtendimento(session, client, userId) {
    try {
      await this.planilhaService.addAtendimento({
        nome: session.data.nome,
        telefone: session.data.telefone,
        servico: session.data.servico,
        dataAtendimento: session.data.dataAtendimento,
        dataAgendamento: session.data.dataAgendamento || 'N/A',
        status: 'Pendente'
      });

      logger.info(`Atendimento finalizado para ${session.data.nome}`);
      this.userSessions.delete(userId);

    } catch (error) {
      logger.error('Erro ao finalizar atendimento:', error);
      await client.sendText(userId, 'Erro ao registrar atendimento. Por favor, tente novamente.');
    }
  }

  parseDateTime(dateTimeStr) {
    const [datePart, timePart] = dateTimeStr.split(' ');
    const [day, month, year] = datePart.split('/');
    const [hour, minute] = timePart.split(':');
    
    return new Date(year, month - 1, day, hour, minute);
  }

  getPausedUsersCount() {
    return this.pausedUsers.size;
  }

  getPausedUsersList() {
    const list = [];
    const now = new Date();

    for (const [userId, pauseData] of this.pausedUsers.entries()) {
      const remaining = pauseData.pauseUntil - now;
      const minutesRemaining = Math.ceil(remaining / (1000 * 60));

      list.push({
        userId,
        userName: pauseData.userName,
        pausedAt: pauseData.pausedAt,
        pauseUntil: pauseData.pauseUntil,
        minutesRemaining: minutesRemaining > 0 ? minutesRemaining : 0
      });
    }

    return list;
  }
}

module.exports = MessageHandler;