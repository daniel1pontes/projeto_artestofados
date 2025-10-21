const { Pool } = require('pg');
const logger = require('../utils/logger');

class DatabaseConfig {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'artestofados',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Testar conexão
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.info('✅ Conectado ao PostgreSQL com sucesso');
      
      return true;
    } catch (error) {
      this.isConnected = false;
      logger.error('❌ Erro ao conectar com PostgreSQL:', error);
      throw error;
    }
  }

  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não está conectado');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executada', { 
        query: text, 
        duration: `${duration}ms`,
        rows: result.rowCount 
      });
      
      return result;
    } catch (error) {
      logger.error('Erro na query:', error);
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('🔌 Conexão com PostgreSQL fechada');
    }
  }

  getPool() {
    return this.pool;
  }

  isReady() {
    return this.isConnected;
  }
}

module.exports = new DatabaseConfig();