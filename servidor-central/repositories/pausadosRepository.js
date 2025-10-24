const database = require('../config');
const logger = require('../../utils/logger');

class PausadosRepository {
  async pausarUsuario(userId, userName, horas = 2) {
    try {
      const retomaEm = new Date();
      retomaEm.setHours(retomaEm.getHours() + horas);

      const query = `
        INSERT INTO usuarios_pausados (user_id, user_name, retoma_em)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          user_name = EXCLUDED.user_name,
          pausado_em = CURRENT_TIMESTAMP,
          retoma_em = EXCLUDED.retoma_em
        RETURNING *
      `;

      const result = await database.query(query, [userId, userName, retomaEm]);
      
      logger.info(`Usuário ${userName} (${userId}) pausado por ${horas} horas`);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao pausar usuário:', error);
      throw error;
    }
  }

  async verificarUsuarioPausado(userId) {
    try {
      const query = `
        SELECT 
          user_id as "userId",
          user_name as "userName",
          pausado_em as "pausadoEm",
          retoma_em as "retomaEm",
          EXTRACT(EPOCH FROM (retoma_em - CURRENT_TIMESTAMP))/60 as "minutosRestantes"
        FROM usuarios_pausados
        WHERE user_id = $1 AND retoma_em > CURRENT_TIMESTAMP
      `;

      const result = await database.query(query, [userId]);

      if (result.rows.length === 0) {
        return { pausado: false };
      }

      const usuario = result.rows[0];
      
      return {
        pausado: true,
        userId: usuario.userId,
        userName: usuario.userName,
        pausadoEm: usuario.pausadoEm,
        retomaEm: usuario.retomaEm,
        minutosRestantes: Math.ceil(usuario.minutosRestantes)
      };
    } catch (error) {
      logger.error('Erro ao verificar usuário pausado:', error);
      return { pausado: false };
    }
  }

  async listarUsuariosPausados() {
    try {
      const query = `
        SELECT 
          user_id as "userId",
          user_name as "userName",
          pausado_em as "pausadoEm",
          retoma_em as "retomaEm",
          EXTRACT(EPOCH FROM (retoma_em - CURRENT_TIMESTAMP))/60 as "minutosRestantes"
        FROM usuarios_pausados
        WHERE retoma_em > CURRENT_TIMESTAMP
        ORDER BY retoma_em DESC
      `;

      const result = await database.query(query);
      
      return result.rows.map(usuario => ({
        ...usuario,
        minutesRemaining: Math.ceil(usuario.minutosRestantes)
      }));
    } catch (error) {
      logger.error('Erro ao listar usuários pausados:', error);
      return [];
    }
  }

  async reativarUsuario(userId) {
    try {
      const query = `
        DELETE FROM usuarios_pausados
        WHERE user_id = $1
        RETURNING *
      `;

      const result = await database.query(query, [userId]);

      if (result.rowCount > 0) {
        logger.info(`Usuário ${userId} reativado manualmente`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Erro ao reativar usuário:', error);
      throw error;
    }
  }

  async limparPausasExpiradas() {
    try {
      const query = `
        DELETE FROM usuarios_pausados
        WHERE retoma_em <= CURRENT_TIMESTAMP
        RETURNING user_id, user_name
      `;

      const result = await database.query(query);

      if (result.rowCount > 0) {
        logger.info(`${result.rowCount} pausa(s) expirada(s) removida(s)`);
        result.rows.forEach(usuario => {
          logger.debug(`Bot reativado automaticamente para: ${usuario.user_name}`);
        });
      }

      return result.rowCount;
    } catch (error) {
      logger.error('Erro ao limpar pausas expiradas:', error);
      return 0;
    }
  }

  async contarUsuariosPausados() {
    try {
      const query = `
        SELECT COUNT(*) as total 
        FROM usuarios_pausados
        WHERE retoma_em > CURRENT_TIMESTAMP
      `;

      const result = await database.query(query);
      return parseInt(result.rows[0].total);
    } catch (error) {
      logger.error('Erro ao contar usuários pausados:', error);
      return 0;
    }
  }

  async obterEstatisticas() {
    try {
      const query = `
        SELECT 
          COUNT(*) as "totalPausados",
          AVG(EXTRACT(EPOCH FROM (retoma_em - pausado_em))/3600) as "mediaHorasPausa",
          MAX(retoma_em) as "maiorRetoma"
        FROM usuarios_pausados
        WHERE retoma_em > CURRENT_TIMESTAMP
      `;

      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error);
      return null;
    }
  }
}

module.exports = PausadosRepository;