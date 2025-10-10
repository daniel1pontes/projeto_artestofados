const express = require('express');
const path = require('path');
const open = require('open');

class ClienteDesktop {
  constructor() {
    this.app = express();
    this.port = 3000;
    // URL do servidor central (configurável)
    this.serverUrl = process.env.SERVER_URL || 'http://localhost:4000';
  }

  setupMiddlewares() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  setupRoutes() {
    // Servir o dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    });

    // Endpoint para obter configuração do servidor
    this.app.get('/api/config', (req, res) => {
      res.json({
        serverUrl: this.serverUrl,
        version: '1.0.0'
      });
    });
  }

  async start() {
    this.setupMiddlewares();
    this.setupRoutes();

    this.app.listen(this.port, 'localhost', async () => {
      console.log('═══════════════════════════════════════════');
      console.log('🖥️  ARTESTOFADOS - Cliente Desktop');
      console.log(`📱 Dashboard: http://localhost:${this.port}`);
      console.log(`🔗 Servidor: ${this.serverUrl}`);
      console.log('═══════════════════════════════════════════');
      
      // Abrir navegador automaticamente
      try {
        await open(`http://localhost:${this.port}`);
        console.log('✅ Dashboard aberto no navegador');
      } catch (error) {
        console.log('⚠️  Abra manualmente: http://localhost:3000');
      }
    });
  }
}

const cliente = new ClienteDesktop();
cliente.start();

module.exports = ClienteDesktop;