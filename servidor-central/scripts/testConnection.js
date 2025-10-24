require('dotenv').config();
const database = require('../database/config');
const logger = require('../utils/logger');

async function testConnection() {
  console.log('🔍 Testando conexão com PostgreSQL...\n');

  try {
    console.log('📡 Configuração:');
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.DB_PORT || 5432}`);
    console.log(`   Database: ${process.env.DB_NAME || 'artestofados'}`);
    console.log(`   User: ${process.env.DB_USER || 'artestofados'}\n`);

    console.log('🔌 Conectando...');
    await database.connect();
    console.log('✅ Conexão estabelecida!\n');

    console.log('📊 Testando query...');
    const result = await database.query('SELECT NOW() as timestamp, version() as version');
    console.log(`✅ Query executada com sucesso!`);
    console.log(`   Timestamp: ${result.rows[0].timestamp}`);
    console.log(`   Versão: ${result.rows[0].version.split(',')[0]}\n`);

    console.log('📋 Verificando tabelas...');
    const tables = await database.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    if (tables.rows.length > 0) {
      console.log(`✅ ${tables.rows.length} tabela(s) encontrada(s):`);
      tables.rows.forEach(row => {
        console.log(`   - ${row.tablename}`);
      });
    } else {
      console.log('⚠️  Nenhuma tabela encontrada. Execute: npm run db:setup');
    }

    console.log('\n📈 Estatísticas:');
    const stats = await database.query(`
      SELECT 
        (SELECT COUNT(*) FROM atendimentos) as atendimentos,
        (SELECT COUNT(*) FROM ordens_servico) as ordens_servico,
        (SELECT COUNT(*) FROM usuarios_pausados) as usuarios_pausados
    `);

    console.log(`   Atendimentos: ${stats.rows[0].atendimentos}`);
    console.log(`   Ordens de Serviço: ${stats.rows[0].ordens_servico}`);
    console.log(`   Usuários Pausados: ${stats.rows[0].usuarios_pausados}`);

    console.log('\n✅ Teste de conexão concluído com sucesso!');
    console.log('🎉 Banco de dados está pronto para uso!\n');

    await database.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Erro no teste de conexão:');
    console.error(`   ${error.message}\n`);

    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Solução: Verifique se o PostgreSQL está rodando');
      console.error('   sudo systemctl start postgresql\n');
    } else if (error.code === '3D000') {
      console.error('💡 Solução: O banco de dados não existe');
      console.error('   Execute: npm run db:setup\n');
    } else if (error.code === '28P01') {
      console.error('💡 Solução: Credenciais incorretas');
      console.error('   Verifique DB_USER e DB_PASSWORD no .env\n');
    }

    process.exit(1);
  }
}

if (require.main === module) {
  testConnection();
}

module.exports = testConnection;