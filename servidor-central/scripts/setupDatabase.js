require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

async function setupDatabase() {
  console.log('🚀 Iniciando setup do banco de dados...\n');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'artestofados',
    password: process.env.DB_PASSWORD || 'artestofados123',
    database: 'postgres'
  });

  try {
    const dbName = process.env.DB_NAME || 'artestofados';
    
    console.log(`📊 Verificando se banco '${dbName}' existe...`);
    const checkDb = await pool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkDb.rowCount === 0) {
      console.log(`📝 Criando banco de dados '${dbName}'...`);
      await pool.query(`CREATE DATABASE ${dbName}`);
      console.log('✅ Banco de dados criado com sucesso!\n');
    } else {
      console.log('✅ Banco de dados já existe\n');
    }

    await pool.end();

    const appPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: dbName,
      user: process.env.DB_USER || 'artestofados',
      password: process.env.DB_PASSWORD || 'artestofados123',
    });

    console.log('📋 Executando schema SQL...');
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf-8');
    
    await appPool.query(schemaSql);
    console.log('✅ Schema criado com sucesso!\n');

    console.log('📊 Verificando tabelas criadas...');
    const tablesResult = await appPool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('✅ Tabelas criadas:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });

    await appPool.end();

    console.log('\n✅ Setup do banco de dados concluído com sucesso!');
    console.log('\n📌 Informações de conexão:');
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.DB_PORT || 5432}`);
    console.log(`   Database: ${dbName}`);
    console.log(`   User: ${process.env.DB_USER || 'artestofados'}`);

  } catch (error) {
    console.error('❌ Erro no setup do banco de dados:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = setupDatabase;