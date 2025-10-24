const { OpenAI } = require('openai');
const logger = require('../utils/logger');

class AIConfig {
  constructor() {
    this.openai = null;
    this.isInitialized = false;
    this.initialize();
  }

  initialize() {
    try {
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('OPENAI_API_KEY não configurada. IA desabilitada.');
        return;
      }

      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      this.isInitialized = true;
      logger.info('✅ OpenAI inicializada com sucesso');
    } catch (error) {
      logger.error('❌ Erro ao inicializar OpenAI:', error);
      this.isInitialized = false;
    }
  }

  async generateResponse(userMessage, context = {}) {
    if (!this.isInitialized) {
      throw new Error('IA não está inicializada');
    }

    try {
      const systemPrompt = this.getSystemPrompt();
      const contextPrompt = this.buildContextPrompt(context);

      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'system', content: contextPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 500,
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
      });

      const response = completion.choices[0].message.content.trim();
      logger.info(`IA respondeu para "${userMessage.substring(0, 50)}..."`);
      
      return response;
    } catch (error) {
      logger.error('Erro ao gerar resposta da IA:', error);
      throw error;
    }
  }

  getSystemPrompt() {
    return `Você é um assistente virtual da empresa ARTESTOFADOS, especializada em fabricação e reforma de móveis estofados em João Pessoa/PB.

INFORMAÇÕES DA EMPRESA:
- Nome: Artestofados
- Localização: João Pessoa/PB
- Telefone: ${process.env.EMPRESA_TELEFONE || '(83) 3241-1234'}
- Email: ${process.env.EMPRESA_EMAIL || 'contato@artestofados.com.br'}
- Especialidades: Fabricação e reforma de sofás, cadeiras, poltronas, camas

SERVIÇOS OFERECIDOS:
1. FABRICAÇÃO: Criação de móveis estofados sob medida
   - Sofás de todos os tamanhos
   - Cadeiras personalizadas  
   - Poltronas confortáveis
   - Camas estofadas

2. REFORMA: Restauração de móveis existentes
   - Troca de espuma
   - Revestimento novo
   - Reparo estrutural
   - Modernização do design

INSTRUÇÕES COMPORTAMENTAIS:
- Seja cordial, prestativo e profissional
- Use emojis moderadamente para tornar a conversa amigável
- Responda de forma clara e objetiva
- Sempre ofereça soluções práticas
- Incentive o cliente a enviar fotos quando relevante
- Sugira agendamento de visita técnica quando necessário
- Mantenha foco nos serviços da empresa
- Use linguagem brasileira coloquial mas respeitosa

FLUXO DE ATENDIMENTO RECOMENDADO:
1. Cumprimentar o cliente
2. Identificar a necessidade (fabricação ou reforma)
3. Coletar informações específicas
4. Orientar sobre próximos passos
5. Agendar visita ou reunião se necessário

LIMITAÇÕES:
- NÃO forneça orçamentos específicos sem avaliar o projeto
- NÃO confirme agendamentos - apenas colete preferências
- NÃO prometa prazos sem avaliar a demanda
- Sempre mencione que detalhes finais serão confirmados pela equipe

Se o cliente fizer perguntas fora do escopo da empresa, redirecione educadamente para os serviços de estofados.`;
  }

  buildContextPrompt(context) {
    let contextPrompt = 'CONTEXTO DA CONVERSA:\n';
    
    if (context.clienteName) {
      contextPrompt += `- Nome do cliente: ${context.clienteName}\n`;
    }
    
    if (context.previousMessages) {
      contextPrompt += `- Mensagens anteriores: ${context.previousMessages}\n`;
    }
    
    if (context.userIntent) {
      contextPrompt += `- Intenção identificada: ${context.userIntent}\n`;
    }

    if (context.sessionData) {
      contextPrompt += `- Dados da sessão: ${JSON.stringify(context.sessionData)}\n`;
    }

    return contextPrompt;
  }

  async analyzeIntent(message) {
    if (!this.isInitialized) {
      return 'unknown';
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Analise a mensagem do cliente e classifique a intenção em uma das categorias:
            - fabricacao: Cliente quer fabricar móvel novo
            - reforma: Cliente quer reformar móvel existente  
            - orcamento: Cliente quer saber preços
            - agendamento: Cliente quer agendar visita/reunião
            - duvida: Cliente tem dúvidas gerais
            - cumprimento: Cliente está cumprimentando
            - outros: Não se encaixa nas categorias acima
            
            Responda APENAS com a categoria, sem explicações.`
          },
          { role: 'user', content: message }
        ],
        max_tokens: 10,
        temperature: 0.1,
      });

      return completion.choices[0].message.content.trim().toLowerCase();
    } catch (error) {
      logger.error('Erro ao analisar intenção:', error);
      return 'unknown';
    }
  }

  isReady() {
    return this.isInitialized;
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      maxTokens: process.env.OPENAI_MAX_TOKENS || 500,
    };
  }
}

module.exports = AIConfig;