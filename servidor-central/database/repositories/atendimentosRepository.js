const database = require('../config');
const logger = require('../../utils/logger');

class AtendimentosRepository {
  
  async criar(dados) {
    try {
      const query = `
        INSERT INTO atendimentos (nome, telefone, servico, detalhes, data_atendimento, data_agendamento, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;
      
      const values = [
        dados.nome,
        dados.telefone,
        dados.servico,
        dados.detalhes || '',
        dados.dataAtendimento || new Date(),
        dados.dataAgendamento || null,
        dados.status || 'Pendente'
      ];

      const result = await database.query(query, values);
      const novoId = result.rows[0].id;
      
      logger.info(`Atendimento criado com ID: ${novoId}`);
      return novoId;

    } catch (error) {
      logger.error('Erro ao criar atendimento:', error);
      throw error;
    }
  }

  async buscarTodos(filtros = {}) {
    try {
      let query = `
        SELECT id, nome, telefone, servico, detalhes, 
               data_atendimento, data_agendamento, status,
               created_at, updated_at
        FROM atendimentos
        WHERE 1=1
      `;
      
      const values = [];
      let paramCount = 0;

      if (filtros.nome) {
        paramCount++;
        query += ` AND LOWER(nome) LIKE LOWER($${paramCount})`;
        values.push(`%${filtros.nome}%`);
      }

      if (filtros.telefone) {
        paramCount++;
        query += ` AND telefone LIKE $${paramCount}`;
        values.push(`%${filtros.telefone}%`);
      }

      if (filtros.status) {
        paramCount++;
        query += ` AND status = $${paramCount}`;
        values.push(filtros.status);
      }

      if (filtros.servico) {
        paramCount++;
        query += ` AND servico = $${paramCount}`;
        values.push(filtros.servico);
      }

      query += ` ORDER BY data_atendimento DESC`;

      const result = await database.query(query, values);
      
      return result.rows.map(row => ({
        id: row.id,
        nome: row.nome,
        telefone: row.telefone,
        servico: row.servico,
        detalhes: row.detalhes,
        dataAtendimento: this.formatarData(row.data_atendimento),
        dataAgendamento: row.data_agendamento,
        status: row.status
      }));

    } catch (error) {
      logger.error('Erro ao buscar atendimentos:', error);
      throw error;
    }
  }

  async buscarPorId(id) {
    try {
      const query = `
        SELECT * FROM atendimentos WHERE id = $1
      `;
      
      const result = await database.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        nome: row.nome,
        telefone: row.telefone,
        servico: row.servico,
        detalhes: row.detalhes,
        dataAtendimento: row.data_atendimento,
        dataAgendamento: row.data_agendamento,
        status: row.status
      };

    } catch (error) {
      logger.error('Erro ao buscar atendimento por ID:', error);
      throw error;
    }
  }

  async atualizarStatus(id, novoStatus) {
    try {
      const query = `
        UPDATE atendimentos 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id
      `;
      
      const result = await database.query(query, [novoStatus, id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Atendimento ${id} não encontrado`);
      }

      logger.info(`Status do atendimento ${id} atualizado para: ${novoStatus}`);
      return true;

    } catch (error) {
      logger.error('Erro ao atualizar status:', error);
      throw error;
    }
  }

  async deletar(id) {
    try {
      const query = `DELETE FROM atendimentos WHERE id = $1 RETURNING id`;
      const result = await database.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error(`Atendimento ${id} não encontrado`);
      }

      logger.info(`Atendimento ${id} deletado`);
      return true;

    } catch (error) {
      logger.error('Erro ao deletar atendimento:', error);
      throw error;
    }
  }

  async contarTodos() {
    try {
      const query = `SELECT COUNT(*) as total FROM atendimentos`;
      const result = await database.query(query);
      return parseInt(result.rows[0].total);
    } catch (error) {
      logger.error('Erro ao contar atendimentos:', error);
      throw error;
    }
  }

  formatarData(data) {
    if (!data) return null;
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

module.exports = AtendimentosRepository;