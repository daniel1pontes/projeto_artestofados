const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class PlanilhaService {
  constructor() {
    this.filePath = path.join(__dirname, '../../data/atendimentos.xlsx');
    this.ensureDataDir();
  }

  async ensureDataDir() {
    const dataDir = path.dirname(this.filePath);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      logger.error('Erro ao criar diretório de dados:', error);
    }
  }

  async initWorkbook() {
    const workbook = new ExcelJS.Workbook();
    
    try {
      // Tentar carregar planilha existente
      await workbook.xlsx.readFile(this.filePath);
    } catch (error) {
      // Se não existir, criar nova
      await this.createNewWorkbook(workbook);
    }

    return workbook;
  }

  async createNewWorkbook(workbook) {
    const worksheet = workbook.addWorksheet('Atendimentos');

    // Definir colunas - ATUALIZADO para novo fluxo
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Data Atendimento', key: 'dataAtendimento', width: 20 },
      { header: 'Nome', key: 'nome', width: 30 },
      { header: 'Telefone', key: 'telefone', width: 15 },
      { header: 'Serviço', key: 'servico', width: 20 },
      { header: 'Detalhes', key: 'detalhes', width: 40 },
      { header: 'Data Agendamento', key: 'dataAgendamento', width: 20 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    // Estilizar cabeçalho
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    await workbook.xlsx.writeFile(this.filePath);
    logger.info('Nova planilha de atendimentos criada');
  }

  async addAtendimento(dados) {
    try {
      const workbook = await this.initWorkbook();
      const worksheet = workbook.getWorksheet('Atendimentos');

      // Gerar ID único
      const lastRow = worksheet.lastRow;
      const newId = lastRow ? (lastRow.getCell('id').value || 0) + 1 : 1;

      // Adicionar nova linha
      worksheet.addRow({
        id: newId,
        dataAtendimento: this.formatDate(dados.dataAtendimento),
        nome: dados.nome,
        telefone: dados.telefone,
        servico: dados.servico,
        detalhes: dados.detalhes || '',
        dataAgendamento: dados.dataAgendamento,
        status: dados.status || 'Pendente'
      });

      // Salvar arquivo
      await workbook.xlsx.writeFile(this.filePath);
      
      logger.info(`Atendimento #${newId} adicionado à planilha - ${dados.servico}`);
      return newId;

    } catch (error) {
      logger.error('Erro ao adicionar atendimento:', error);
      throw error;
    }
  }

  async getAtendimentos(filtros = {}) {
    try {
      const workbook = await this.initWorkbook();
      const worksheet = workbook.getWorksheet('Atendimentos');

      const atendimentos = [];
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Pular cabeçalho

        const atendimento = {
          id: row.getCell('id').value,
          dataAtendimento: row.getCell('dataAtendimento').value,
          nome: row.getCell('nome').value,
          telefone: row.getCell('telefone').value,
          servico: row.getCell('servico').value,
          detalhes: row.getCell('detalhes').value || '',
          dataAgendamento: row.getCell('dataAgendamento').value,
          status: row.getCell('status').value
        };

        // Aplicar filtros
        if (this.matchFilters(atendimento, filtros)) {
          atendimentos.push(atendimento);
        }
      });

      return atendimentos;

    } catch (error) {
      logger.error('Erro ao buscar atendimentos:', error);
      throw error;
    }
  }

  async updateStatus(id, novoStatus) {
    try {
      const workbook = await this.initWorkbook();
      const worksheet = workbook.getWorksheet('Atendimentos');

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Pular cabeçalho
        
        if (row.getCell('id').value === id) {
          row.getCell('status').value = novoStatus;
        }
      });

      await workbook.xlsx.writeFile(this.filePath);
      logger.info(`Status do atendimento #${id} atualizado para: ${novoStatus}`);

    } catch (error) {
      logger.error('Erro ao atualizar status:', error);
      throw error;
    }
  }

  matchFilters(atendimento, filtros) {
    if (filtros.nome && !atendimento.nome.toLowerCase().includes(filtros.nome.toLowerCase())) {
      return false;
    }
    if (filtros.telefone && !atendimento.telefone.includes(filtros.telefone)) {
      return false;
    }
    if (filtros.status && atendimento.status !== filtros.status) {
      return false;
    }
    if (filtros.servico && atendimento.servico !== filtros.servico) {
      return false;
    }
    return true;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

module.exports = PlanilhaService;