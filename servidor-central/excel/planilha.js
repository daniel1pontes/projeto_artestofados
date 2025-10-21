const AtendimentosRepository = require('../database/repositories/atendimentosRepository');
const logger = require('../utils/logger');

class PlanilhaService {
  constructor() {
    this.atendimentosRepo = new AtendimentosRepository();
  }

  async addAtendimento(dados) {
    try {
      const novoId = await this.atendimentosRepo.criar(dados);
      logger.info(`Atendimento #${novoId} adicionado - ${dados.servico}`);
      return novoId;
    } catch (error) {
      logger.error('Erro ao adicionar atendimento:', error);
      throw error;
    }
  }

  async getAtendimentos(filtros = {}) {
    try {
      return await this.atendimentosRepo.buscarTodos(filtros);
    } catch (error) {
      logger.error('Erro ao buscar atendimentos:', error);
      throw error;
    }
  }

  async updateStatus(id, novoStatus) {
    try {
      await this.atendimentosRepo.atualizarStatus(id, novoStatus);
      logger.info(`Status do atendimento #${id} atualizado para: ${novoStatus}`);
    } catch (error) {
      logger.error('Erro ao atualizar status:', error);
      throw error;
    }
  }

  async getAtendimentoPorId(id) {
    try {
      return await this.atendimentosRepo.buscarPorId(id);
    } catch (error) {
      logger.error('Erro ao buscar atendimento por ID:', error);
      throw error;
    }
  }

  async deletarAtendimento(id) {
    try {
      await this.atendimentosRepo.deletar(id);
      logger.info(`Atendimento #${id} deletado`);
    } catch (error) {
      logger.error('Erro ao deletar atendimento:', error);
      throw error;
    }
  }

  async contarAtendimentos() {
    try {
      return await this.atendimentosRepo.contarTodos();
    } catch (error) {
      logger.error('Erro ao contar atendimentos:', error);
      throw error;
    }
  }
}

module.exports = PlanilhaService;