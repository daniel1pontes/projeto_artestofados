const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class GeradorOS {
  constructor() {
    this.outputDir = path.join(__dirname, '../../data/ordens_servico');
    this.ensureOutputDir();
  }

  async ensureOutputDir() {
    try {
      await fs.promises.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      logger.error('Erro ao criar diretório de OS:', error);
    }
  }

  async gerarOS(dados) {
    try {
      // Validar dados obrigatórios
      this.validarDados(dados);

      // Gerar ID único para a OS
      const osId = this.gerarIdOS(dados.cliente);

      // Calcular valores
      const { valorTotal, desconto, valorFinal } = this.calcularValores(dados);

      // Criar documento PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const filePath = path.join(this.outputDir, `OS_${osId}.pdf`);
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Gerar conteúdo do PDF
      this.adicionarCabecalho(doc, osId);
      this.adicionarDadosCliente(doc, dados);
      this.adicionarItens(doc, dados.itens);
      this.adicionarTotais(doc, valorTotal, desconto, valorFinal);
      this.adicionarRodape(doc, dados);

      // Finalizar PDF
      doc.end();

      // Aguardar conclusão
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      logger.info(`Ordem de Serviço ${osId} gerada com sucesso`);

      return {
        osId,
        filePath,
        valorTotal: valorFinal
      };

    } catch (error) {
      logger.error('Erro ao gerar OS:', error);
      throw error;
    }
  }

  validarDados(dados) {
    const camposObrigatorios = ['cliente', 'prazoEntrega', 'formaPagamento', 'itens'];
    
    for (const campo of camposObrigatorios) {
      if (!dados[campo]) {
        throw new Error(`Campo obrigatório ausente: ${campo}`);
      }
    }

    if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
      throw new Error('É necessário informar ao menos um item');
    }
  }

  gerarIdOS(nomeCliente) {
    const timestamp = Date.now();
    const clienteSlug = nomeCliente.substring(0, 3).toUpperCase();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${clienteSlug}${timestamp}${random}`;
  }

  calcularValores(dados) {
    let valorTotal = 0;

    // Calcular total dos itens
    dados.itens.forEach(item => {
      const subtotal = item.quantidade * item.valorUnitario;
      valorTotal += subtotal;
    });

    // Aplicar desconto
    const desconto = dados.desconto || 0;
    const valorDesconto = (valorTotal * desconto) / 100;
    const valorFinal = valorTotal - valorDesconto;

    return {
      valorTotal,
      desconto: valorDesconto,
      valorFinal
    };
  }

  adicionarCabecalho(doc, osId) {
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .text('ARTESTOFADOS', { align: 'center' })
      .fontSize(10)
      .font('Helvetica')
      .text('Especialistas em Estofados', { align: 'center' })
      .moveDown();

    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('ORDEM DE SERVIÇO', { align: 'center' })
      .fontSize(10)
      .font('Helvetica')
      .text(`Nº ${osId}`, { align: 'center' })
      .moveDown(2);
  }

  adicionarDadosCliente(doc, dados) {
    const dataAtual = new Date().toLocaleDateString('pt-BR');

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('DADOS DO CLIENTE')
      .moveDown(0.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Cliente: ${dados.cliente}`, { continued: false })
      .text(`Data de Emissão: ${dataAtual}`)
      .text(`Prazo de Entrega: ${dados.prazoEntrega}`)
      .text(`Forma de Pagamento: ${dados.formaPagamento}`)
      .moveDown(2);
  }

  adicionarItens(doc, itens) {
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('ITENS DO SERVIÇO')
      .moveDown(0.5);

    // Cabeçalho da tabela
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 100;
    const col3 = 350;
    const col4 = 450;
    const col5 = 510;

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('QTD', col1, tableTop)
      .text('DESCRIÇÃO', col2, tableTop)
      .text('VALOR UN.', col3, tableTop)
      .text('TOTAL', col4, tableTop);

    // Linha separadora
    doc
      .moveTo(col1, doc.y + 5)
      .lineTo(545, doc.y + 5)
      .stroke();

    doc.moveDown(0.5);

    // Itens
    doc.font('Helvetica');
    itens.forEach((item, index) => {
      const y = doc.y;
      const subtotal = item.quantidade * item.valorUnitario;

      doc
        .text(item.quantidade, col1, y)
        .text(item.descricao, col2, y, { width: 240 })
        .text(this.formatarMoeda(item.valorUnitario), col3, y)
        .text(this.formatarMoeda(subtotal), col4, y);

      doc.moveDown(0.8);
    });

    doc.moveDown();
  }

  adicionarTotais(doc, valorTotal, desconto, valorFinal) {
    const startY = doc.y;

    doc
      .moveTo(350, startY)
      .lineTo(545, startY)
      .stroke();

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .text('Subtotal:', 400, doc.y, { continued: true })
      .text(this.formatarMoeda(valorTotal), { align: 'right' });

    if (desconto > 0) {
      doc
        .text('Desconto:', 400, doc.y, { continued: true })
        .text(`- ${this.formatarMoeda(desconto)}`, { align: 'right' });
    }

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('TOTAL:', 400, doc.y, { continued: true })
      .text(this.formatarMoeda(valorFinal), { align: 'right' });

    doc.moveDown(2);
  }

  adicionarRodape(doc, dados) {
    const bottomY = 700;

    doc
      .moveTo(50, bottomY)
      .lineTo(545, bottomY)
      .stroke();

    doc
      .fontSize(8)
      .font('Helvetica')
      .text('Artestofados - João Pessoa/PB', 50, bottomY + 10)
      .text('Telefone: (83) 3241-1234', 50, bottomY + 22)
      .text('Email: contato@artestofados.com.br', 50, bottomY + 34);

    doc
      .text('_______________________________', 350, bottomY + 30)
      .text('Assinatura do Cliente', 370, bottomY + 45, { width: 200 });
  }

  formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  async buscarOS(osId) {
    const filePath = path.join(this.outputDir, `OS_${osId}.pdf`);
    
    try {
      await fs.promises.access(filePath);
      return filePath;
    } catch {
      throw new Error(`Ordem de Serviço ${osId} não encontrada`);
    }
  }

  async listarOS() {
    try {
      const files = await fs.promises.readdir(this.outputDir);
      return files
        .filter(file => file.startsWith('OS_') && file.endsWith('.pdf'))
        .map(file => {
          const osId = file.replace('OS_', '').replace('.pdf', '');
          return {
            osId,
            arquivo: file,
            caminho: path.join(this.outputDir, file)
          };
        });
    } catch (error) {
      logger.error('Erro ao listar OS:', error);
      return [];
    }
  }
}

module.exports = GeradorOS;