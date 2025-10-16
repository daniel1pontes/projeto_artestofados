const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class GeradorOS {
  constructor() {
    this.outputDir = path.join(__dirname, '../data/ordens_servico');
    this.buildDir = path.join(__dirname, '../build');
    this.logoPathAbsoluto = 'C:\\Users\\lucia\\OneDrive\\Documentos\\Projetos\\projeto_artestofados\\cliente-desktop\\build\\logo_cortada.png';
    this.ensureOutputDir();
  }

  formatarData(data) {
    if (typeof data === 'string' && data.includes('/')) {
      return data;
    }
    
    try {
      const dataObj = new Date(data);
      
      if (isNaN(dataObj.getTime())) {
        return data;
      }
      
      const dia = String(dataObj.getDate()).padStart(2, '0');
      const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
      const ano = dataObj.getFullYear();
      
      return `${dia}/${mes}/${ano}`;
    } catch (error) {
      logger.error('Erro ao formatar data:', error);
      return data;
    }
  }

  async salvarMetadados(metadata) {
    try {
      const metadataPath = path.join(this.outputDir, 'metadata.json');
      let allMetadata = [];

      try {
        const data = await fs.promises.readFile(metadataPath, 'utf8');
        allMetadata = JSON.parse(data);
      } catch (error) {
        allMetadata = [];
      }

      allMetadata.push(metadata);
      await fs.promises.writeFile(metadataPath, JSON.stringify(allMetadata, null, 2));
      logger.info('Metadados salvos com sucesso');
    } catch (error) {
      logger.error('Erro ao salvar metadados:', error);
    }
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

          this.adicionarCabecalho(doc);
          this.adicionarTabelaItens(doc, dados);
          this.adicionarDadosCliente(doc, dados);
          this.adicionarAssinaturas(doc);

          if (this.temImagens(dados)) {
            this.adicionarAnexos(doc, dados);
          }

          if (dados.imagens && dados.imagens.length > 0) {
            this.adicionarImagensUsuario(doc, dados.imagens);
          }

          doc.end();

          stream.on('finish', async () => {
            try {
              const stats = await fs.promises.stat(filePath);
              logger.info('PDF criado com sucesso. Tamanho:', stats.size, 'bytes');

              const { valorTotal } = this.calcularValores(dados);

              await this.salvarMetadados({
                osId,
                cliente: dados.cliente,
                valorTotal,
                dataCriacao: new Date().toISOString(),
                prazoEntrega: dados.prazoEntrega,
                formaPagamento: dados.formaPagamento
              });

              resolve({
                osId,
                filePath,
                fileName,
                valorTotal,
                cliente: dados.cliente,
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

    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('Artestofados', 170, 45)
      .fontSize(10)
      .font('Helvetica')
      .text('AV: Almirante Barroso, 389, Centro – João Pessoa –PB', 170, 65)
      .text('CNPJ: 08.621.718/0001-07', 170, 80);

    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('ORDEM DE SERVIÇO', 50, 140, { align: 'center', width: 495 });

    doc.moveDown(3);
  }

  calcularValores(dados) {
    let subtotal = 0;
    let totalDescontoItens = 0;
    
    // Calcula subtotal dos itens e desconto por item
    dados.itens.forEach(item => {
      const valorItem = parseFloat(item.quantidade) * parseFloat(item.valorUnitario);
      
      if (item.desconto && parseFloat(item.desconto) > 0) {
        const descontoItem = (valorItem * parseFloat(item.desconto)) / 100;
        totalDescontoItens += descontoItem;
        subtotal += (valorItem - descontoItem);
      } else {
        subtotal += valorItem;
      }
    });

    // Aplica desconto GERAL (na nota toda) se houver
    let descontoGeral = 0;
    let valorTotal = subtotal;
    
    if (dados.desconto && parseFloat(dados.desconto) > 0) {
      descontoGeral = (subtotal * parseFloat(dados.desconto)) / 100;
      valorTotal = subtotal - descontoGeral;
    }

    return {
      subtotal,
      descontoGeral,
      totalDescontoItens,
      valorTotal,
      temDesconto: descontoGeral > 0 || totalDescontoItens > 0
    };
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
    
    let posX = margemEsq;
    colunas.forEach((col, i) => {
      if (i > 0) {
        posX += colunas[i - 1].width;
        doc.moveTo(posX, currentY).lineTo(posX, currentY + headerHeight).stroke();
      }
    });

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
    dados.itens.forEach(item => {
      const valorBruto = parseFloat(item.quantidade) * parseFloat(item.valorUnitario);
      let valorFinal = valorBruto;
      
      if (item.desconto && parseFloat(item.desconto) > 0) {
        const descontoItem = (valorBruto * parseFloat(item.desconto)) / 100;
        valorFinal = valorBruto - descontoItem;
      }

      const alturaLinha = 30;

      if (currentY + alturaLinha > 680) {
        doc.addPage();
        currentY = 50;
      }

      posX = margemEsq;
      doc.rect(posX, currentY, larguraTotal, alturaLinha).stroke();
      
      colunas.forEach((col, i) => {
        if (i > 0) {
          posX += colunas[i - 1].width;
          doc.moveTo(posX, currentY).lineTo(posX, currentY + alturaLinha).stroke();
        }
      });

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
      // Sempre mostrar apenas o valor final, sem risco
      doc.fillColor('#000000')
        .text(this.formatarMoeda(valorFinal), posX + 3, currentY + 10, { 
          width: colunas[3].width - 6, 
          align: 'center'
        });
  

      currentY += alturaLinha;
    });

    // ========== LINHAS FINAIS - SUBTOTAL, DESCONTO E TOTAL ==========
    const { subtotal, descontoGeral, totalDescontoItens, valorTotal, temDesconto } = this.calcularValores(dados);
    const alturaLinha = 25;
    const posicaoUltimaColuna = margemEsq + colunas[0].width + colunas[1].width + colunas[2].width;

    // Se houver desconto GERAL, mostra SUBTOTAL primeiro
    if (descontoGeral > 0 || totalDescontoItens > 0) {
      // Linha SUBTOTAL
      doc.rect(margemEsq, currentY, larguraTotal, alturaLinha).stroke();
      
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('SUBTOTAL', margemEsq + 3, currentY + 8, {
        width: colunas[0].width + colunas[1].width - 50,
        align: 'center'
      });

      doc.text(this.formatarMoeda(subtotal), posicaoUltimaColuna + 3, currentY + 8, {
        width: colunas[3].width - 40,
        align: 'right'
      });

      currentY += alturaLinha;

      // Linha do DESCONTO GERAL (se houver)
      if (descontoGeral > 0) {
        doc.rect(margemEsq, currentY, larguraTotal, alturaLinha).stroke();
        
        doc.fillColor('#000000')
          .text(`DESCONTO (${dados.desconto}%)`, margemEsq + 3, currentY + 8, {
            width: colunas[0].width + colunas[1].width - 50,
            align: 'center'
          })
          .text(`- ${this.formatarMoeda(descontoGeral)}`, posicaoUltimaColuna + 3, currentY + 8, {
            width: colunas[3].width - 40,
            align: 'right'
          })
          .fillColor('#000000');

        currentY += alturaLinha;
      }
    }

    // Linha do VALOR TOTAL (sempre aparece)
    doc.rect(margemEsq, currentY, larguraTotal, alturaLinha).stroke();

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
    doc.text('VALOR TOTAL', margemEsq + 3, currentY + 6, {
      width: colunas[0].width + colunas[1].width - 50,
      align: 'center'
    });

    doc.text(this.formatarMoeda(valorTotal), posicaoUltimaColuna + 3, currentY + 6, {
      width: colunas[3].width - 40,
      align: 'right'
    });

    doc.y = currentY + alturaLinha + 15;
  }

  adicionarDadosCliente(doc, dados) {
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(`Cliente: ${dados.cliente}`, 70)
      .moveDown(0.5)
      .text(`Prazo de entrega: ${this.formatarData(dados.prazoEntrega)}`)
      .moveDown(0.5)
      .text(`Forma de Pagamento: ${dados.formaPagamento}`)
      .moveDown(2);
  }

  adicionarAssinaturas(doc) {
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
      .text('Anexos do Cliente', { align: 'center' });
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
      const metadataPath = path.join(this.outputDir, 'metadata.json');
      
      let metadata = [];
      try {
        const data = await fs.promises.readFile(metadataPath, 'utf8');
        metadata = JSON.parse(data);
      } catch (error) {
        logger.warn('Arquivo de metadados não encontrado');
      }

      const files = await fs.promises.readdir(this.outputDir);
      const osFiles = files.filter(file => file.startsWith('OS_') && file.endsWith('.pdf'));
      
      return osFiles
        .map((file, index) => {
          const osId = file.replace('OS_', '').replace('.pdf', '');
          const meta = metadata.find(m => m.osId === osId);
          
          return {
            id: index + 1,
            osId,
            cliente: meta ? meta.cliente : 'Desconhecido',
            valorTotal: meta ? meta.valorTotal : 0,
            dataCriacao: meta ? meta.dataCriacao : null,
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