const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class GeradorOS {
  constructor() {
  this.outputDir = path.join(__dirname, '../data/ordens_servico');
  this.buildDir = path.join(__dirname, '../build');

  // Caminho fixo da logo
  this.logoPathAbsoluto = 'C:\\Users\\lucia\\OneDrive\\Documentos\\Projetos\\projeto_artestofados\\cliente-desktop\\build\\logo_cortada.png';

  this.ensureOutputDir();
}


  async ensureOutputDir() {
    try {
      await fs.promises.mkdir(this.outputDir, { recursive: true });
      await fs.promises.mkdir(this.buildDir, { recursive: true });
      logger.info('Diretórios criados/verificados');
    } catch (error) {
      logger.error('Erro ao criar diretórios:', error);
    }
  }

  async gerarOS(dados) {
    try {
      logger.info('Iniciando geração de OS...');
      await this.ensureOutputDir();
      this.validarDados(dados);

      const osId = this.gerarIdOS(dados.cliente);
      logger.info('Gerando OS com ID:', osId);

      const fileName = `OS_${osId}.pdf`;
      const filePath = path.join(this.outputDir, fileName);

      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ size: 'A4', margin: 50 });
          const stream = fs.createWriteStream(filePath);

          stream.on('error', (error) => {
            logger.error('Erro na stream:', error);
            reject(error);
          });

          doc.on('error', (error) => {
            logger.error('Erro no documento:', error);
            reject(error);
          });

          doc.pipe(stream);

          // ======= CONTEÚDO PRINCIPAL =======
          this.adicionarCabecalho(doc);
          this.adicionarTabelaItens(doc, dados);
          this.adicionarDadosCliente(doc, dados);
          this.adicionarAssinaturas(doc);

          // ======= ANEXOS DE ITENS (por descrição) =======
          if (this.temImagens(dados)) {
            this.adicionarAnexos(doc, dados);
          }

          // ======= IMAGENS DO USUÁRIO =======
          if (dados.imagens && dados.imagens.length > 0) {
            this.adicionarImagensUsuario(doc, dados.imagens);
          }

          // Finaliza e salva o arquivo
          doc.end();

          stream.on('finish', async () => {
            try {
              const stats = await fs.promises.stat(filePath);
              logger.info('PDF criado com sucesso. Tamanho:', stats.size, 'bytes');

              const valorTotal = dados.itens.reduce((sum, item) =>
                sum + (parseFloat(item.quantidade) * parseFloat(item.valorUnitario)), 0);

              resolve({
                osId,
                filePath,
                fileName,
                valorTotal,
                sucesso: true
              });
            } catch (error) {
              logger.error('Erro ao finalizar PDF:', error);
              reject(error);
            }
          });

        } catch (error) {
          logger.error('Erro ao criar documento:', error);
          reject(error);
        }
      });

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

    dados.itens.forEach((item, index) => {
      if (!item.quantidade || item.quantidade <= 0) {
        throw new Error(`Item ${index + 1}: Quantidade inválida`);
      }
      if (!item.descricao || item.descricao.trim() === '') {
        throw new Error(`Item ${index + 1}: Descrição é obrigatória`);
      }
      if (!item.valorUnitario || item.valorUnitario <= 0) {
        throw new Error(`Item ${index + 1}: Valor unitário inválido`);
      }
    });
  }

  gerarIdOS(nomeCliente) {
    const timestamp = Date.now();
    const clienteSlug = nomeCliente.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
    return `${clienteSlug}${timestamp}`;
  }

  adicionarCabecalho(doc) {
    // Tenta carregar logo, senão desenha retângulo
    try {
      if (this.logoPathAbsoluto && fs.existsSync(this.logoPathAbsoluto)) {
        doc.image(this.logoPathAbsoluto, 50, 40, { width: 100 });
        logger.info('Logo carregada com sucesso');
      } else {
        logger.warn('Logo não encontrada em:', this.logoPathAbsoluto);
        doc.rect(50, 40, 100, 80).stroke();
      }
    } catch (error) {
      logger.warn('Erro ao carregar logo:', error.message);
      doc.rect(50, 40, 100, 80).stroke();
    }

    // Dados da empresa
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Artestofados', 170, 45)
      .fontSize(10)
      .font('Helvetica')
      .text('AV: Almirante Barroso, 389, Centro – João Pessoa –PB', 170, 65)
      .text('CNPJ: 08.621.718/0001-07', 170, 80);

    // Título
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('ORDEM DE SERVIÇO', 50, 140, { align: 'center', width: 495 });

    doc.moveDown(3);
  }

  adicionarTabelaItens(doc, dados) {
    const margemEsq = 50;
    const larguraTotal = 495;
    const colunas = [
      { header: 'QTD', width: 70 },
      { header: 'DESCRIÇÃO', width: 230 },
      { header: 'VALOR UNITÁRIO', width: 90 },
      { header: 'VALOR TOTAL', width: 105 },
    ];

    let currentY = doc.y;
    const headerHeight = 25;

    // ========== CABEÇALHO ==========
    doc.rect(margemEsq, currentY, larguraTotal, headerHeight).stroke();
    
    // Linhas verticais do cabeçalho
    let posX = margemEsq;
    colunas.forEach((col, i) => {
      if (i > 0) {
        posX += colunas[i - 1].width;
        doc.moveTo(posX, currentY).lineTo(posX, currentY + headerHeight).stroke();
      }
    });

    // Texto do cabeçalho
    doc.fontSize(9).font('Helvetica-Bold');
    posX = margemEsq;
    colunas.forEach(col => {
      doc.text(col.header, posX + 3, currentY + 8, {
        width: col.width - 6,
        align: 'center'
      });
      posX += col.width;
    });

    currentY += headerHeight;
    doc.font('Helvetica').fontSize(9);

    // ========== ITENS ==========
    let valorTotal = 0;
    dados.itens.forEach(item => {
      const totalItem = parseFloat(item.quantidade) * parseFloat(item.valorUnitario);
      valorTotal += totalItem;
      const alturaLinha = 30;

      // Verifica se precisa de nova página
      if (currentY + alturaLinha > 680) {
        doc.addPage();
        currentY = 50;
      }

      // Desenha linha do item
      posX = margemEsq;
      doc.rect(posX, currentY, larguraTotal, alturaLinha).stroke();
      
      // Linhas verticais
      colunas.forEach((col, i) => {
        if (i > 0) {
          posX += colunas[i - 1].width;
          doc.moveTo(posX, currentY).lineTo(posX, currentY + alturaLinha).stroke();
        }
      });

      // Texto dos itens
      posX = margemEsq;
      doc.text(item.quantidade.toString(), posX + 3, currentY + 10, { 
        width: colunas[0].width - 6, 
        align: 'center' 
      });
      posX += colunas[0].width;
      
      doc.text(item.descricao, posX + 3, currentY + 10, { 
        width: colunas[1].width - 6, 
        align: 'center' 
      });
      posX += colunas[1].width;
      
      doc.text(this.formatarMoeda(item.valorUnitario), posX + 3, currentY + 10, { 
        width: colunas[2].width - 6, 
        align: 'center' 
      });
      posX += colunas[2].width;
      
      doc.text(this.formatarMoeda(totalItem), posX + 3, currentY + 10, { 
        width: colunas[3].width - 6, 
        align: 'center' 
      });

      currentY += alturaLinha;
    });

    // ========== LINHA FINAL - TOTAL ==========
    // ========== LINHA FINAL - TOTAL ==========
    const alturaTotal = 25;

    // desenha o retângulo da última linha
    doc.rect(margemEsq, currentY, larguraTotal, alturaTotal).stroke();

    // Larguras das colunas
    const larguraQtd = colunas[0].width;
    const larguraDescricao = colunas[1].width;
    const larguraValorUnit = colunas[2].width;
    const larguraValorTotal = colunas[3].width;

    // Texto "VALOR TOTAL" ocupando as 2 primeiras colunas (QTD + DESCRIÇÃO)
    const larguraDuasPrimeiras = larguraQtd + larguraDescricao;

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('VALOR TOTAL', margemEsq + 3, currentY + 8, {
      width: larguraDuasPrimeiras -50,
      align: 'center'
    });

    // Valor alinhado à direita na última coluna
    const posicaoUltimaColuna = margemEsq + larguraQtd + larguraDescricao + larguraValorUnit;

    doc.text(this.formatarMoeda(valorTotal), posicaoUltimaColuna + 3, currentY + 8, {
      width: larguraValorTotal - 40,
      align: 'right'
    });

    doc.y = currentY + alturaTotal + 15;
    }
  adicionarDadosCliente(doc, dados) {
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(`Cliente: ${dados.cliente}`, 70)
      .moveDown(0.5)
      .text(`Prazo de entrega: ${dados.prazoEntrega}`)
      .moveDown(0.5)
      .text(`Forma de Pagamento: ${dados.formaPagamento}`)
      .moveDown(2);
  }

  adicionarAssinaturas(doc) {
    // Verifica espaço na página
    if (doc.y > 600) {
      doc.addPage();
      doc.y = 100;
    }

    const dataAtual = new Date().toLocaleDateString('pt-BR');
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`João Pessoa, ${dataAtual}`, 350, doc.y)
      .moveDown(4);

    const lineY = doc.y;
    doc.moveTo(100, lineY).lineTo(250, lineY).stroke();
    doc.moveTo(350, lineY).lineTo(500, lineY).stroke();

    doc
      .fontSize(11)
      .text('Artestofados', 140, lineY + 15, { align: 'center', width: 110 })
      .text('Cliente', 390, lineY + 15, { align: 'center', width: 110 });
  }

  temImagens(dados) {
    return dados.itens.some(item => item.imagens && item.imagens.length > 0);
  }

  adicionarAnexos(doc, dados) {
    dados.itens.forEach((item, itemIndex) => {
      if (item.imagens && item.imagens.length > 0) {
        item.imagens.forEach((imagem, imgIndex) => {
          try {
            doc.addPage();

            const anexoNumero = (itemIndex + 1).toString().padStart(2, '0');
            doc
              .fontSize(12)
              .font('Helvetica-Bold')
              .text(`Anexo ${anexoNumero} - ${item.descricao}`, 50, 50);

            const base64Data = imagem.data.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            doc.image(buffer, 70, 100, {
              fit: [450, 600],
              align: 'center',
              valign: 'center'
            });

            logger.info(`Anexo ${anexoNumero} adicionado`);
          } catch (error) {
            logger.error(`Erro ao adicionar anexo ${itemIndex}-${imgIndex}:`, error);
          }
        });
      }
    });
  }

  adicionarImagensUsuario(doc, imagens) {
    if (!imagens || imagens.length === 0) return;

    doc.addPage();
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('📎 Anexos do Cliente', { align: 'center' });
    doc.moveDown(2);

    let posY = 100;
    for (const imagem of imagens) {
      try {
        const base64Data = imagem.data.replace(/^data:image\/[a-z]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        if (posY > 650) {
          doc.addPage();
          posY = 100;
        }

        doc.image(buffer, 100, posY, { 
          fit: [400, 400], 
          align: 'center', 
          valign: 'center' 
        });
        posY += 420;
      } catch (err) {
        logger.error('Erro ao adicionar imagem do cliente:', err);
      }
    }
  }

  formatarMoeda(valor) {
    return parseFloat(valor).toLocaleString('pt-BR', {
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
      await this.ensureOutputDir();
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
        })
        .sort((a, b) => b.osId.localeCompare(a.osId));
    } catch (error) {
      logger.error('Erro ao listar OS:', error);
      return [];
    }
  }

  async deletarOS(osId) {
    try {
      const filePath = await this.buscarOS(osId);
      await fs.promises.unlink(filePath);
      logger.info(`OS ${osId} deletada com sucesso`);
      return true;
    } catch (error) {
      logger.error('Erro ao deletar OS:', error);
      throw error;
    }
  }
}

module.exports = GeradorOS;