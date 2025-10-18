// servidor-central/chatbot/messageHandler.js - VERSÃO CORRIGIDA FLUXO BOTÕES
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
      
      // CORREÇÃO: Priorizar selectedRowId (resposta de botão) sobre texto
      let messageBody = '';
      if (selectedRowId) {
        messageBody = selectedRowId; // Resposta de botão/lista
        logger.info(`📱 Resposta de botão recebida: ${selectedRowId}`);
      } else if (text?.message) {
        messageBody = text.message; // Mensagem de texto normal
        logger.info(`💬 Mensagem de texto recebida: ${text.message}`);
      }

      logger.info(`Mensagem processada de ${senderName}: ${messageBody}`);

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
    logger.info(`🔄 Processando step: ${session.step} | Mensagem: ${messageBody}`);
    
    switch (session.step) {
      case 'inicio':
        await this.handleInicio(session, client, userId);
        break;

      case 'aguardando_tipo_servico':
        await this.handleTipoServico(messageBody, session, client, userId);
        break;

      // FLUXO REFORMA
      case 'aguardando_foto_reforma':
        await this.handleFotoReforma(messageBody, session, client, userId);
        break;

      // FLUXO FABRICAÇÃO
      case 'aguardando_tipo_estofado':
        await this.handleTipoEstofado(messageBody, session, client, userId);
        break;

      case 'aguardando_tem_projeto':
        await this.handleTemProjeto(messageBody, session, client, userId);
        break;

      case 'aguardando_tipo_reuniao':
        await this.handleTipoReuniao(messageBody, session, client, userId);
        break;

      case 'aguardando_data_reuniao':
        await this.handleDataReuniao(messageBody, session, client, userId);
        break;

      case 'finalizado':
        await this.handleInicio(session, client, userId);
        break;

      default:
        logger.warn(`Step desconhecido: ${session.step}`);
        await this.handleInicio(session, client, userId);
    }
  }

  async handleInicio(session, client, userId) {
    const menuMessage = `Olá ${session.data.nome}! 👋

Bem-vindo(a) à *Artestofados*! 🛋️

Como podemos ajudá-lo(a) hoje?`;

    // Lista interativa principal
    const optionList = {
      title: 'Nossos Serviços',
      buttonLabel: 'Ver opções',
      options: [
        {
          id: 'fabricacao',
          title: '🏭 Fabricação',
          description: 'Criação de móveis sob medida'
        },
        {
          id: 'reforma',
          title: '🔧 Reforma',
          description: 'Reforma de móveis existentes'
        }
      ]
    };

    await client.sendOptionList(userId, menuMessage, optionList);
    session.step = 'aguardando_tipo_servico';
  }

  async handleTipoServico(messageBody, session, client, userId) {
    // CORREÇÃO: Verificar tanto IDs de botão quanto texto digitado
    const opcao = messageBody.toLowerCase().trim();

    logger.info(`🔍 Verificando tipo de serviço: ${opcao}`);

    if (opcao === 'fabricacao' || opcao === 'fabricação') {
      session.data.tipoServico = 'Fabricação';
      
      await client.sendText(
        userId,
        `Perfeito! Vamos criar algo especial para você! 🏭\n\nQue tipo de estofado você gostaria de fabricar?`
      );
      
      // Lista de tipos de estofado
      const tiposEstofado = {
        title: 'Tipos de Estofados',
        buttonLabel: 'Escolher tipo',
        options: [
          {
            id: 'sofa',
            title: '🛋️ Sofá',
            description: 'Sofás de todos os tamanhos'
          },
          {
            id: 'cadeira',
            title: '🪑 Cadeira',
            description: 'Cadeiras personalizadas'
          },
          {
            id: 'poltrona',
            title: '🛋️ Poltrona',
            description: 'Poltronas confortáveis'
          },
          {
            id: 'cama',
            title: '🛏️ Cama',
            description: 'Camas estofadas'
          }
        ]
      };

      await client.sendOptionList(userId, 'Selecione o tipo:', tiposEstofado);
      session.step = 'aguardando_tipo_estofado';
      
    } else if (opcao === 'reforma') {
      session.data.tipoServico = 'Reforma';
      
      await client.sendText(
        userId,
        `Ótima escolha! Vamos dar uma nova vida ao seu móvel! 🔧\n\n📷 *Por favor, envie uma foto do móvel que deseja reformar.*\n\nIsso nos ajudará a entender melhor o trabalho necessário.`
      );
      
      session.step = 'aguardando_foto_reforma';
      
    } else {
      logger.warn(`Opção inválida recebida: ${opcao}`);
      await client.sendText(
        userId,
        `Opção inválida. Por favor, selecione uma das opções do menu.`
      );
      await this.handleInicio(session, client, userId);
    }
  }

  // ==================== FLUXO REFORMA ====================

  async handleFotoReforma(messageBody, session, client, userId) {
    // Aqui você pode verificar se recebeu uma imagem
    // Por enquanto, vamos assumir que qualquer mensagem é válida
    
    session.data.fotoEnviada = true;
    
    await client.sendText(
      userId,
      `📷 Foto recebida com sucesso!\n\n✅ Sua solicitação de reforma foi registrada.\n\n👨‍💼 *Um de nossos especialistas irá analisar a foto e entrar em contato em breve* para:\n\n• Avaliar o trabalho necessário\n• Fornecer um orçamento detalhado\n• Combinar os próximos passos\n\n⏰ *Tempo de resposta:* Até 2 horas úteis\n\nObrigado por escolher a Artestofados! 🛋️`
    );

    await this.finalizarAtendimento(session, client, userId);
  }

  // ==================== FLUXO FABRICAÇÃO ====================

  async handleTipoEstofado(messageBody, session, client, userId) {
    const tipos = {
      'sofa': 'Sofá',
      'cadeira': 'Cadeira', 
      'poltrona': 'Poltrona',
      'cama': 'Cama'
    };

    const opcao = messageBody.toLowerCase().trim();
    logger.info(`🔍 Verificando tipo de estofado: ${opcao}`);
    
    if (tipos[opcao]) {
      session.data.tipoEstofado = tipos[opcao];
      
      await client.sendText(
        userId,
        `Excelente escolha! ${tipos[opcao]} é uma das nossas especialidades! 🎯\n\nVocê já tem um projeto ou desenho do que deseja?`
      );

      // Lista Sim/Não para projeto
      const temProjeto = {
        title: 'Projeto Próprio',
        buttonLabel: 'Responder',
        options: [
          {
            id: 'sim_projeto',
            title: '✅ Sim',
            description: 'Tenho projeto/desenho'
          },
          {
            id: 'nao_projeto',
            title: '❌ Não',
            description: 'Preciso de ajuda com o projeto'
          }
        ]
      };

      await client.sendOptionList(userId, 'Sobre o projeto:', temProjeto);
      session.step = 'aguardando_tem_projeto';
    } else {
      logger.warn(`Tipo de estofado inválido: ${opcao}`);
      await client.sendText(
        userId,
        `Opção inválida. Por favor, selecione um dos tipos disponíveis.`
      );
      // Voltar para escolha de tipo
      session.step = 'aguardando_tipo_servico';
      await this.handleTipoServico('fabricacao', session, client, userId);
    }
  }

  async handleTemProjeto(messageBody, session, client, userId) {
    const opcao = messageBody.toLowerCase().trim();
    logger.info(`🔍 Verificando se tem projeto: ${opcao}`);

    if (opcao === 'sim_projeto' || opcao === 'sim') {
      session.data.temProjeto = true;
      await client.sendText(
        userId,
        `Perfeito! Com projeto fica ainda melhor! 📐\n\nVamos agendar uma conversa para detalhar tudo?`
      );
    } else if (opcao === 'nao_projeto' || opcao === 'não' || opcao === 'nao') {
      session.data.temProjeto = false;
      await client.sendText(
        userId,
        `Sem problemas! Nossos designers irão ajudá-lo a criar o projeto perfeito! 🎨\n\nVamos agendar uma conversa para entender suas necessidades?`
      );
    } else {
      logger.warn(`Resposta de projeto inválida: ${opcao}`);
      await client.sendText(
        userId,
        `Por favor, responda se você tem ou não um projeto.`
      );
      return;
    }

    // Lista tipo de reunião
    const tipoReuniao = {
      title: 'Tipo de Atendimento',
      buttonLabel: 'Escolher',
      options: [
        {
          id: 'online',
          title: '💻 Reunião Online',
          description: 'Videoconferência pelo WhatsApp/Meet'
        },
        {
          id: 'presencial',
          title: '🏠 Visita Presencial',
          description: 'Visita técnica no local'
        }
      ]
    };

    await client.sendOptionList(userId, 'Como prefere conversar?', tipoReuniao);
    session.step = 'aguardando_tipo_reuniao';
  }

  async handleTipoReuniao(messageBody, session, client, userId) {
    const opcao = messageBody.toLowerCase().trim();
    logger.info(`🔍 Verificando tipo de reunião: ${opcao}`);

    if (opcao === 'online') {
      session.data.tipoReuniao = 'Reunião Online';
      await client.sendText(
        userId,
        `Ótimo! Reunião online é prática e rápida! 💻\n\n📅 *Por favor, informe sua preferência de data e horário:*\n\nFormato: DD/MM/AAAA HH:MM\nExemplo: 25/10/2025 14:30`
      );
    } else if (opcao === 'presencial') {
      session.data.tipoReuniao = 'Visita Presencial';
      await client.sendText(
        userId,
        `Excelente! Nossa equipe fará uma visita técnica! 🏠\n\n📅 *Por favor, informe sua preferência de data e horário:*\n\nFormato: DD/MM/AAAA HH:MM\nExemplo: 25/10/2025 14:30\n\n📍 *Obs:* Atendemos João Pessoa e região metropolitana`
      );
    } else {
      logger.warn(`Tipo de reunião inválido: ${opcao}`);
      await client.sendText(
        userId,
        `Opção inválida. Por favor, escolha entre reunião online ou visita presencial.`
      );
      return;
    }

    session.step = 'aguardando_data_reuniao';
  }

  async handleDataReuniao(messageBody, session, client, userId) {
    const dataTexto = messageBody.trim();
    logger.info(`🔍 Verificando data de reunião: ${dataTexto}`);
    
    const regexData = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/;
    const match = dataTexto.match(regexData);

    if (match) {
      session.data.dataAgendamento = dataTexto;
      
      const tipoReuniao = session.data.tipoReuniao;
      const tipoEstofado = session.data.tipoEstofado;
      const temProjeto = session.data.temProjeto ? 'Sim' : 'Não';
      
      await client.sendText(
        userId,
        `🎉 *Agendamento Confirmado!*\n\n` +
        `📋 *Resumo do seu pedido:*\n` +
        `• Serviço: Fabricação de ${tipoEstofado}\n` +
        `• Projeto próprio: ${temProjeto}\n` +
        `• Tipo: ${tipoReuniao}\n` +
        `• Data/Hora: ${dataTexto}\n\n` +
        `✅ *Próximos passos:*\n` +
        `• Confirmaremos o agendamento em até 2 horas\n` +
        `• Enviaremos o link da reunião (se online)\n` +
        `• Nossa equipe entrará em contato\n\n` +
        `📞 Dúvidas? Entre em contato: ${process.env.EMPRESA_TELEFONE || '(83) 3241-1234'}\n\n` +
        `Obrigado por escolher a Artestofados! 🛋️`
      );

      // Tentar criar evento no calendário
      try {
        await this.calendarService.createEvent({
          summary: `${tipoReuniao} - ${session.data.nome}`,
          description: `Cliente: ${session.data.nome}\nTelefone: ${session.data.telefone}\nServiço: Fabricação de ${tipoEstofado}\nProjeto próprio: ${temProjeto}\nTipo: ${tipoReuniao}`,
          start: this.parseDateTime(dataTexto),
          attendee: session.data.nome
        });
      } catch (error) {
        logger.error('Erro ao criar evento no calendar:', error);
      }

      await this.finalizarAtendimento(session, client, userId);
    } else {
      logger.warn(`Formato de data inválido: ${dataTexto}`);
      await client.sendText(
        userId,
        `📅 Formato de data inválido.\n\n*Por favor, use o formato:* DD/MM/AAAA HH:MM\n\n*Exemplo:* 25/10/2025 14:30`
      );
    }
  }

  // ==================== FINALIZAÇÃO ====================

  async finalizarAtendimento(session, client, userId) {
    try {
      await this.planilhaService.addAtendimento({
        nome: session.data.nome,
        telefone: session.data.telefone,
        servico: session.data.tipoServico,
        detalhes: this.gerarDetalhesAtendimento(session.data),
        dataAtendimento: session.data.dataAtendimento,
        dataAgendamento: session.data.dataAgendamento || 'N/A',
        status: 'Pendente'
      });

      logger.info(`Atendimento finalizado para ${session.data.nome} - ${session.data.tipoServico}`);
      this.userSessions.delete(userId);

    } catch (error) {
      logger.error('Erro ao finalizar atendimento:', error);
      await client.sendText(userId, 'Erro ao registrar atendimento. Por favor, tente novamente.');
    }
  }

  gerarDetalhesAtendimento(data) {
    let detalhes = `Tipo: ${data.tipoServico}`;
    
    if (data.tipoServico === 'Fabricação') {
      detalhes += ` | Estofado: ${data.tipoEstofado}`;
      detalhes += ` | Projeto próprio: ${data.temProjeto ? 'Sim' : 'Não'}`;
      detalhes += ` | Reunião: ${data.tipoReuniao}`;
    } else if (data.tipoServico === 'Reforma') {
      detalhes += ` | Foto enviada: ${data.fotoEnviada ? 'Sim' : 'Não'}`;
    }
    
    return detalhes;
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