const database = require('../config');
const logger = require('../../utils/logger');

class AtendimentosRepository {
  async criar(dados) {
    try {
      const query = `
        INSERT INTO atendimentos 
        (nome, telefone, servico, detalhes, data_atendimento, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const valores = [
        dados.nome,
        dados.telefone,
        dados.servico,
        dados.detalhes || null,
        dados.dataAtendimento || new Date(),
        dados.status || 'Em andamento'
      ];

      const result = await database.query(query, valores);
      
      logger.info(`Atendimento criado para ${dados.nome}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao criar atendimento:', error);
      throw error;
    }
  }

  async buscarTodos(filtros = {}) {
    try {
      let query = `
        SELECT 
          id,
          nome,
          telefone,
          servico,
          detalhes,
          data_atendimento as "dataAtendimento",
          status,
          created_at as "criadoEm"
        FROM atendimentos
        WHERE 1=1
      `;

      const valores = [];
      let contador = 1;

      if (filtros.nome) {
        query += ` AND LOWER(nome) LIKE LOWER($${contador++})`;
        valores.push(`%${filtros.nome}%`);
      }

      if (filtros.telefone) {
        query += ` AND telefone LIKE $${contador++}`;
        valores.push(`%${filtros.telefone}%`);
      }

      if (filtros.servico) {
        query += ` AND LOWER(servico) LIKE LOWER($${contador++})`;
        valores.push(`%${filtros.servico}%`);
      }

      if (filtros.status) {
        query += ` AND status = $${contador++}`;
        valores.push(filtros.status);
      }

      if (filtros.dataInicio) {
        query += ` AND data_atendimento >= $${contador++}`;
        valores.push(filtros.dataInicio);
      }

      if (filtros.dataFim) {
        query += ` AND data_atendimento <= $${contador++}`;
        valores.push(filtros.dataFim);
      }

      query += ` ORDER BY data_atendimento DESC`;

      if (filtros.limite) {
        query += ` LIMIT $${contador++}`;
        valores.push(filtros.limite);
      }

      const result = await database.query(query, valores);
      return result.rows;
    } catch (error) {
      logger.error('Erro ao buscar atendimentos:', error);
      throw error;
    }
  }

  async buscarPorId(id) {
    try {
      const query = `
        SELECT 
          id,
          nome,
          telefone,
          servico,
          detalhes,
          data_atendimento as "dataAtendimento",
          status,
          created_at as "criadoEm",
          updated_at as "atualizadoEm"
        FROM atendimentos
        WHERE id = $1
      `;

      const result = await database.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Erro ao buscar atendimento ${id}:`, error);
      throw error;
    }
  }

  async buscarPorTelefone(telefone) {
    try {
      const query = `
        SELECT 
          id,
          nome,
          telefone,
          servico,
          detalhes,
          data_atendimento as "dataAtendimento",
          status,
          created_at as "criadoEm"
        FROM atendimentos
        WHERE telefone = $1
        ORDER BY data_atendimento DESC
      `;

      const result = await database.query(query, [telefone]);
      return result.rows;
    } catch (error) {
      logger.error('Erro ao buscar atendimentos por telefone:', error);
      throw error;
    }
  }

  async atualizar(id, dados) {
    try {
      const campos = [];
      const valores = [];
      let contador = 1;

      if (dados.nome) {
        campos.push(`nome = $${contador++}`);
        valores.push(dados.nome);
      }

      if (dados.telefone) {
        campos.push(`telefone = $${contador++}`);
        valores.push(dados.telefone);
      }

      if (dados.servico) {
        campos.push(`servico = $${contador++}`);
        valores.push(dados.servico);
      }

      if (dados.detalhes !== undefined) {
        campos.push(`detalhes = $${contador++}`);
        valores.push(dados.detalhes);
      }

      if (dados.status) {
        campos.push(`status = $${contador++}`);
        valores.push(dados.status);
      }

      if (campos.length === 0) {
        throw new Error('Nenhum campo para atualizar');
      }

      valores.push(id);

      const query = `
        UPDATE atendimentos
        SET ${campos.join(', ')}
        WHERE id = $${contador}
        RETURNING *
      `;

      const result = await database.query(query, valores);

      if (result.rowCount === 0) {
        throw new Error(`Atendimento ${id} não encontrado`);
      }

      logger.info(`Atendimento ${id} atualizado`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Erro ao atualizar atendimento ${id}:`, error);
      throw error;
    }
  }

  async deletar(id) {
    try {
      const query = 'DELETE FROM atendimentos WHERE id = $1 RETURNING *';
      const result = await database.query(query, [id]);

      if (result.rowCount === 0) {
        throw new Error(`Atendimento ${id} não encontrado`);
      }

      logger.info(`Atendimento ${id} deletado`);
      return true;
    } catch (error) {
      logger.error(`Erro ao deletar atendimento ${id}:`, error);
      throw error;
    }
  }

  async contar(filtros = {}) {
    try {
      let query = 'SELECT COUNT(*) as total FROM atendimentos WHERE 1=1';
      const valores = [];
      let contador = 1;

      if (filtros.status) {
        query += ` AND status = $${contador++}`;
        valores.push(filtros.status);
      }

      if (filtros.dataInicio) {
        query += ` AND data_atendimento >= $${contador++}`;
        valores.push(filtros.dataInicio);
      }

      if (filtros.dataFim) {
        query += ` AND data_atendimento <= $${contador++}`;
        valores.push(filtros.dataFim);
      }

      const result = await database.query(query, valores);
      return parseInt(result.rows[0].total);
    } catch (error) {
      logger.error('Erro ao contar atendimentos:', error);
      return 0;
    }
  }

  async obterEstatisticas() {
    try {
      const query = `
        SELECT 
          COUNT(*) as "totalAtendimentos",
          COUNT(CASE WHEN status = 'Em andamento' THEN 1 END) as "emAndamento",
          COUNT(CASE WHEN status = 'Concluído' THEN 1 END) as "concluidos",
          COUNT(CASE WHEN status = 'Cancelado' THEN 1 END) as "cancelados",
          COUNT(CASE WHEN data_atendimento >= CURRENT_DATE THEN 1 END) as "hoje",
          COUNT(CASE WHEN data_atendimento >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as "ultimos7Dias",
          COUNT(CASE WHEN data_atendimento >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as "ultimos30Dias"
        FROM atendimentos
      `;

      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      return null;
    }
  }

  async obterServicosMaisComuns(limite = 5) {
    try {
      const query = `
        SELECT 
          servico,
          COUNT(*) as total
        FROM atendimentos
        GROUP BY servico
        ORDER BY total DESC
        LIMIT $1
      `;

      const result = await database.query(query, [limite]);
      return result.rows;
    } catch (error) {
      logger.error('Erro ao obter serviços mais comuns:', error);
      return [];
    }
  }
}

module.exports = AtendimentosRepository;