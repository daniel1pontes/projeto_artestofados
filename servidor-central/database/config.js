const { Pool } = require('pg');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'artestofados',
        user: process.env.DB_USER || 'artestofados',
        password: process.env.DB_PASSWORD || 'artestofados123',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      await this.pool.query('SELECT NOW()');
      this.isConnected = true;
      
      logger.info('✅ Conexão com PostgreSQL estabelecida');
      return true;
    } catch (error) {
      logger.error('❌ Erro ao conectar com PostgreSQL:', error);
      throw error;
    }
  }

  async query(text, params) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não está conectado');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executada', { 
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
      logger.info('Conexão com PostgreSQL encerrada');
    }
  }

  isReady() {
    return this.isConnected;
  }
}

module.exports = new Database();