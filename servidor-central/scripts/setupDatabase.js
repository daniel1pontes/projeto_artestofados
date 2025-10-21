require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function setupDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres' // Conectar ao banco padrão primeiro
  });

  try {
    await client.connect();
    console.log('🔌 Conectado ao PostgreSQL');

    // Criar banco de dados se não existir
    const dbName = process.env.DB_NAME || 'artestofados';
    
    try {
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Banco de dados '${dbName}' criado com sucesso`);
    } catch (error) {
      if (error.code === '42P04') {
        console.log(`ℹ️  Banco de dados '${dbName}' já existe`);
      } else {
        throw error;
      }
    }

    await client.end();

    // Conectar ao banco específico e executar schema
    const dbClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: dbName
    });

    await dbClient.connect();
    console.log(`🔌 Conectado ao banco '${dbName}'`);

    // Ler e executar schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    
    await dbClient.query(schema);
    console.log('✅ Schema executado com sucesso');

    await dbClient.end();
    console.log('🎉 Banco de dados configurado com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao configurar banco de dados:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;