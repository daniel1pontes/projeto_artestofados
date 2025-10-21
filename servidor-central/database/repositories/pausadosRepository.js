const database = require('../config');
const logger = require('../../utils/logger');

class PausadosRepository {
  
  async pausarUsuario(userId, userName, horasPausa = 2) {
    try {
      const pausaAte = new Date();
      pausaAte.setHours(pausaAte.getHours() + horasPausa);

      // Primeiro, desativar pausas anteriores deste usuário
      await this.desativarPausasUsuario(userId);

      // Criar nova pausa
      const query = `
        INSERT INTO usuarios_pausados (user_id, user_name, pausa_ate)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          user_name = $2,
          pausado_em = CURRENT_TIMESTAMP,
          pausa_ate = $3,
          ativo = true
        RETURNING id
      `;
      
      const values = [userId, userName, pausaAte];
      const result = await database.query(query, values);

      logger.info(`Usuário ${userName} pausado até ${pausaAte.toLocaleString('pt-BR')}`);
      return result.rows[0].id;

    } catch (error) {
      logger.error('Erro ao pausar usuário:', error);
      throw error;
    }
  }

  async reativarUsuario(userId) {
    try {
      const query = `
        UPDATE usuarios_pausados 
        SET ativo = false
        WHERE user_id = $1 AND ativo = true
        RETURNING id, user_name
      `;
      
      const result = await database.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return false; // Usuário não estava pausado
      }

      const userName = result.rows[0].user_name;
      logger.info(`Bot reativado para usuário: ${userName}`);
      return true;

    } catch (error) {
      logger.error('Erro ao reativar usuário:', error);
      throw error;
    }
  }

  async verificarUsuarioPausado(userId) {
    try {
      const query = `
        SELECT * FROM usuarios_pausados 
        WHERE user_id = $1 
          AND ativo = true 
          AND pausa_ate > CURRENT_TIMESTAMP
      `;
      
      const result = await database.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return { pausado: false };
      }

      const pausa = result.rows[0];
      const agora = new Date();
      const tempoRestante = pausa.pausa_ate - agora;
      const minutosRestantes = Math.ceil(tempoRestante / (1000 * 60));

      return {
        pausado: true,
        pausadoEm: pausa.pausado_em,
        pausaAte: pausa.pausa_ate,
        minutosRestantes: minutosRestantes > 0 ? minutosRestantes : 0,
        userName: pausa.user_name
      };

    } catch (error) {
      logger.error('Erro ao verificar usuário pausado:', error);
      throw error;
    }
  }

  async listarUsuariosPausados() {
    try {
      const query = `
        SELECT user_id, user_name, pausado_em, pausa_ate
        FROM usuarios_pausados 
        WHERE ativo = true 
          AND pausa_ate > CURRENT_TIMESTAMP
        ORDER BY pausado_em DESC
      `;
      
      const result = await database.query(query);
      
      return result.rows.map(row => {
        const agora = new Date();
        const tempoRestante = row.pausa_ate - agora;
        const minutosRestantes = Math.ceil(tempoRestante / (1000 * 60));

        return {
          userId: row.user_id,
          userName: row.user_name,
          pausadoEm: row.pausado_em,
          pausaAte: row.pausa_ate,
          minutesRemaining: minutosRestantes > 0 ? minutosRestantes : 0
        };
      });

    } catch (error) {
      logger.error('Erro ao listar usuários pausados:', error);
      throw error;
    }
  }

  async limparPausasExpiradas() {
    try {
      const query = `
        UPDATE usuarios_pausados 
        SET ativo = false
        WHERE ativo = true 
          AND pausa_ate <= CURRENT_TIMESTAMP
        RETURNING user_id, user_name
      `;
      
      const result = await database.query(query);
      
      if (result.rows.length > 0) {
        const usuarios = result.rows.map(r => r.user_name).join(', ');
        logger.info(`Pausas expiradas removidas para: ${usuarios}`);
      }

      return result.rows.length;

    } catch (error) {
      logger.error('Erro ao limpar pausas expiradas:', error);
      throw error;
    }
  }

  async desativarPausasUsuario(userId) {
    try {
      const query = `
        UPDATE usuarios_pausados 
        SET ativo = false
        WHERE user_id = $1 AND ativo = true
      `;
      
      await database.query(query, [userId]);

    } catch (error) {
      logger.error('Erro ao desativar pausas do usuário:', error);
      throw error;
    }
  }

  async contarUsuariosPausados() {
    try {
      const query = `
        SELECT COUNT(*) as total 
        FROM usuarios_pausados 
        WHERE ativo = true 
          AND pausa_ate > CURRENT_TIMESTAMP
      `;
      
      const result = await database.query(query);
      return parseInt(result.rows[0].total);

    } catch (error) {
      logger.error('Erro ao contar usuários pausados:', error);
      throw error;
    }
  }

  // Método para limpeza de dados antigos (pode ser executado periodicamente)
  async limparDadosAntigos(diasAntigos = 30) {
    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - diasAntigos);

      const query = `
        DELETE FROM usuarios_pausados 
        WHERE ativo = false 
          AND pausado_em < $1
      `;
      
      const result = await database.query(query, [dataLimite]);
      
      if (result.rowCount > 0) {
        logger.info(`${result.rowCount} registros antigos de pausas removidos`);
      }

      return result.rowCount;

    } catch (error) {
      logger.error('Erro ao limpar dados antigos:', error);
      throw error;
    }
  }
}

module.exports = PausadosRepository;