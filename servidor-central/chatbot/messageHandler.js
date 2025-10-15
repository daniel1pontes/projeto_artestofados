const PlanilhaService = require('../excel/planilha');
const CalendarService = require('../google_calendar/calendar');
const logger = require('../utils/logger');

class MessageHandler {
  constructor() {
    this.planilhaService = new PlanilhaService();
    this.calendarService = new CalendarService();
    this.userSessions = new Map();
    this.pausedUsers = new Map(); // Armazena usuários pausados e tempo de retorno
  }

  async handle(message, client) {
    try {
      // ==================== REGRA 1: IGNORAR GRUPOS ====================
      const chat = await message.getChat();
      if (chat.isGroup) {
        logger.info(`Mensagem de grupo ignorada: ${chat.name}`);
        return; // Não responde grupos
      }

      const contact = await message.getContact();
      const userId = contact.id._serialized;
      const messageBody = message.body.trim();

      logger.info(`Mensagem recebida de ${contact.name || contact.pushname}: ${messageBody}`);

      // ==================== REGRA 2: VERIFICAR SE ADMIN ENVIOU MENSAGEM ====================
      // Se a mensagem FOI enviada pelo bot/admin (fromMe = true)
      // Significa que o admin está conversando manualmente
      if (message.fromMe) {
        // Pausar bot para este cliente por 2 horas
        this.pauseUserBot(userId, contact.name || contact.pushname);
        
        logger.info(`👤 Admin respondeu no chat com ${contact.name}. Bot pausado por 2h.`);
        
        // Não envia mensagem automática, pois o admin está conversando
        return;
      }

      // ==================== VERIFICAR SE USUÁRIO ESTÁ PAUSADO ====================
      if (this.isUserPaused(userId)) {
        const remainingTime = this.getRemainingPauseTime(userId);
        logger.info(`Usuário ${contact.name} está pausado. Tempo restante: ${remainingTime} minutos`);
        
        // Não responde enquanto pausado (admin está conversando)
        return;
      }

      // Se chegou aqui, é mensagem do cliente e bot NÃO está pausado
      let session = this.userSessions.get(userId);

      if (!session) {
        session = {
          step: 'inicio',
          data: {
            nome: contact.name || contact.pushname,
            telefone: contact.number,
            dataAtendimento: new Date().toISOString()
          }
        };
        this.userSessions.set(userId, session);
      }

      // ==================== COMANDOS ESPECIAIS ====================
      if (messageBody.toLowerCase() === '#ativar') {
        const resumed = this.resumeUserBot(userId);
        if (resumed) {
          await message.reply(`✅ Bot reativado com sucesso!

O atendimento automático está funcionando novamente.`);
        } else {
          await message.reply(`ℹ️ O bot já está ativo para este chat.`);
        }
        return;
      }

      // Processar normalmente
      await this.processStep(message, session, client);

    } catch (error) {
      logger.error('Erro ao processar mensagem:', error);
    }
  }

  // ==================== MÉTODOS DE CONTROLE DE PAUSA ====================

  pauseUserBot(userId, userName) {
    const pauseUntil = new Date();
    pauseUntil.setHours(pauseUntil.getHours() + 2); // Pausa por 2 horas

    this.pausedUsers.set(userId, {
      pausedAt: new Date(),
      pauseUntil: pauseUntil,
      userName: userName
    });

    logger.info(`🛑 Bot pausado para ${userName} até ${pauseUntil.toLocaleString('pt-BR')}`);
  }

  resumeUserBot(userId) {
    if (this.pausedUsers.has(userId)) {
      const userData = this.pausedUsers.get(userId);
      this.pausedUsers.delete(userId);
      logger.info(`▶️ Bot reativado manualmente para ${userData.userName}`);
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

    // Verificar se o tempo de pausa já passou
    if (now >= pauseData.pauseUntil) {
      // Tempo de pausa expirou, remover da lista
      this.pausedUsers.delete(userId);
      logger.info(`⏰ Pausa expirou automaticamente para ${pauseData.userName}`);
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
    
    return Math.ceil(remaining / (1000 * 60)); // Retorna minutos restantes
  }

  getResumeTime() {
    const resumeTime = new Date();
    resumeTime.setHours(resumeTime.getHours() + 2);
    
    return resumeTime.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ==================== LIMPEZA AUTOMÁTICA ====================
  
  startAutoCleanup() {
    // Limpar pausas expiradas a cada 10 minutos
    setInterval(() => {
      const now = new Date();
      let cleaned = 0;

      for (const [userId, pauseData] of this.pausedUsers.entries()) {
        if (now >= pauseData.pauseUntil) {
          this.pausedUsers.delete(userId);
          cleaned++;
          logger.info(`🧹 Limpeza automática: Pausa expirada para ${pauseData.userName}`);
        }
      }

      if (cleaned > 0) {
        logger.info(`🧹 Limpeza automática: ${cleaned} pausas expiradas removidas`);
      }
    }, 10 * 60 * 1000); // 10 minutos
  }

  // ==================== MÉTODOS DE PROCESSAMENTO DE FLUXO ====================

  async processStep(message, session, client) {
    const messageBody = message.body.trim();

    switch (session.step) {
      case 'inicio':
        await this.handleInicio(message, session);
        break;

      case 'aguardando_servico':
        await this.handleServico(message, session);
        break;

      case 'aguardando_agendamento':
        await this.handleAgendamento(message, session);
        break;

      case 'aguardando_data':
        await this.handleData(message, session);
        break;

      case 'finalizado':
        await this.handleFinalizado(message, session);
        break;

      default:
        await this.handleInicio(message, session);
    }
  }

  async handleInicio(message, session) {
    const menuMessage = `Olá ${session.data.nome}! 👋

Bem-vindo(a) à *Artestofados*! 🛋️

Como posso ajudá-lo(a) hoje?

1️⃣ - Solicitar orçamento
2️⃣ - Agendar visita
3️⃣ - Consultar pedido
4️⃣ - Falar com atendente

_Digite o número da opção desejada._`;

    await message.reply(menuMessage);
    session.step = 'aguardando_servico';
  }

  async handleServico(message, session) {
    const opcao = message.body.trim();

    switch (opcao) {
      case '1':
        session.data.servico = 'Orçamento';
        await message.reply(`Ótimo! Vou registrar sua solicitação de orçamento. 📋

Em breve nossa equipe entrará em contato.

Gostaria de agendar uma visita? (Sim/Não)`);
        session.step = 'aguardando_agendamento';
        break;

      case '2':
        session.data.servico = 'Agendamento de visita';
        await message.reply(`Perfeito! Vou registrar seu agendamento. 📅

Por favor, informe a data e horário desejado no formato:
DD/MM/AAAA HH:MM

Exemplo: 15/10/2025 14:30`);
        session.step = 'aguardando_data';
        break;

      case '3':
        session.data.servico = 'Consulta de pedido';
        await message.reply(`Para consultar seu pedido, entre em contato pelo telefone: (83) 3241-1234

Ou aguarde que um atendente irá lhe ajudar em breve.`);
        await this.finalizarAtendimento(message, session);
        break;

      case '4':
        session.data.servico = 'Atendimento humano';
        await message.reply(`Um de nossos atendentes irá lhe responder em breve. 👤

Aguarde um momento, por favor.`);
        await this.finalizarAtendimento(message, session);
        break;

      default:
        await message.reply(`Opção inválida. Por favor, digite um número de 1 a 4.`);
        break;
    }
  }

  async handleAgendamento(message, session) {
    const resposta = message.body.trim().toLowerCase();

    if (resposta === 'sim' || resposta === 's') {
      await message.reply(`Por favor, informe a data e horário desejado no formato:
DD/MM/AAAA HH:MM

Exemplo: 15/10/2025 14:30`);
      session.step = 'aguardando_data';
    } else {
      await message.reply(`Entendido! Sua solicitação foi registrada. ✅

Em breve nossa equipe entrará em contato.

Obrigado por escolher a Artestofados! 🛋️`);
      await this.finalizarAtendimento(message, session);
    }
  }

  async handleData(message, session) {
    const dataTexto = message.body.trim();
    
    const regexData = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/;
    const match = dataTexto.match(regexData);

    if (match) {
      session.data.dataAgendamento = dataTexto;
      
      await message.reply(`Agendamento confirmado para: ${dataTexto} ✅

Sua solicitação foi registrada com sucesso!

Em breve confirmaremos seu agendamento.

Obrigado por escolher a Artestofados! 🛋️`);

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

      await this.finalizarAtendimento(message, session);
    } else {
      await message.reply(`Data inválida. Por favor, use o formato: DD/MM/AAAA HH:MM

Exemplo: 15/10/2025 14:30`);
    }
  }

  async finalizarAtendimento(message, session) {
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
      
      const userId = message.from;
      this.userSessions.delete(userId);

    } catch (error) {
      logger.error('Erro ao finalizar atendimento:', error);
      await message.reply('Erro ao registrar atendimento. Por favor, tente novamente.');
    }
  }

  parseDateTime(dateTimeStr) {
    const [datePart, timePart] = dateTimeStr.split(' ');
    const [day, month, year] = datePart.split('/');
    const [hour, minute] = timePart.split(':');
    
    return new Date(year, month - 1, day, hour, minute);
  }

  async handleFinalizado(message, session) {
    await this.handleInicio(message, session);
  }

  // ==================== MÉTODOS DE INFORMAÇÃO ====================

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