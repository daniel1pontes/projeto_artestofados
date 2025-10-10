const PlanilhaService = require('..excel/planilha');
const CalendarService = require('../google_calendar/calendar');
const logger = require('../utils/logger');

class MessageHandler {
  constructor() {
    this.planilhaService = new PlanilhaService();
    this.calendarService = new CalendarService();
    this.userSessions = new Map(); // Armazena sessões de usuários
  }

  async handle(message, client) {
    const contact = await message.getContact();
    const userId = contact.id._serialized;
    const messageBody = message.body.trim();

    logger.info(`Mensagem recebida de ${contact.name || contact.pushname}: ${messageBody}`);

    // Verificar se o usuário tem uma sessão ativa
    let session = this.userSessions.get(userId);

    if (!session) {
      // Nova sessão
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

    // Processar de acordo com o passo atual
    await this.processStep(message, session, client);
  }

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
    
    // Validação básica de data
    const regexData = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/;
    const match = dataTexto.match(regexData);

    if (match) {
      session.data.dataAgendamento = dataTexto;
      
      await message.reply(`Agendamento confirmado para: ${dataTexto} ✅

Sua solicitação foi registrada com sucesso!

Em breve confirmaremos seu agendamento.

Obrigado por escolher a Artestofados! 🛋️`);

      // Criar evento no Google Calendar
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
      // Salvar na planilha
      await this.planilhaService.addAtendimento({
        nome: session.data.nome,
        telefone: session.data.telefone,
        servico: session.data.servico,
        dataAtendimento: session.data.dataAtendimento,
        dataAgendamento: session.data.dataAgendamento || 'N/A',
        status: 'Pendente'
      });

      logger.info(`Atendimento finalizado para ${session.data.nome}`);
      
      // Limpar sessão
      const userId = message.from;
      this.userSessions.delete(userId);

    } catch (error) {
      logger.error('Erro ao finalizar atendimento:', error);
      await message.reply('Erro ao registrar atendimento. Por favor, tente novamente.');
    }
  }

  parseDateTime(dateTimeStr) {
    // Converte DD/MM/AAAA HH:MM para objeto Date
    const [datePart, timePart] = dateTimeStr.split(' ');
    const [day, month, year] = datePart.split('/');
    const [hour, minute] = timePart.split(':');
    
    return new Date(year, month - 1, day, hour, minute);
  }
}

module.exports = MessageHandler;