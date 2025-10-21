const database = require('../config');
const logger = require('../../utils/logger');

class OSRepository {
  
  async criar(dadosOS) {
    try {
      return await database.transaction(async (client) => {
        // Inserir OS principal
        const osQuery = `
          INSERT INTO ordens_servico (os_id, cliente, prazo_entrega, forma_pagamento, desconto_geral, valor_total, pdf_path)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, os_id
        `;
        
        const osValues = [
          dadosOS.osId,
          dadosOS.cliente,
          dadosOS.prazoEntrega,
          dadosOS.formaPagamento,
          dadosOS.descontoGeral || 0,
          dadosOS.valorTotal,
          dadosOS.pdfPath || null
        ];

        const osResult = await client.query(osQuery, osValues);
        const osIdGerado = osResult.rows[0].os_id;

        // Inserir itens
        for (const item of dadosOS.itens) {
          const itemQuery = `
            INSERT INTO itens_os (os_id, quantidade, descricao, valor_unitario, desconto, valor_total)
            VALUES ($1, $2, $3, $4, $5, $6)
          `;
          
          const valorTotal = this.calcularValorItemComDesconto(
            item.quantidade, 
            item.valorUnitario, 
            item.desconto || 0
          );

          const itemValues = [
            osIdGerado,
            item.quantidade,
            item.descricao,
            item.valorUnitario,
            item.desconto || 0,
            valorTotal
          ];

          await client.query(itemQuery, itemValues);
        }

        // Inserir imagens se houver
        if (dadosOS.imagens && dadosOS.imagens.length > 0) {
          for (const imagem of dadosOS.imagens) {
            const imagemQuery = `
              INSERT INTO imagens_os (os_id, nome_arquivo, tipo, dados_base64)
              VALUES ($1, $2, $3, $4)
            `;
            
            const imagemValues = [
              osIdGerado,
              imagem.nome,
              'anexo',
              imagem.data
            ];

            await client.query(imagemQuery, imagemValues);
          }
        }

        logger.info(`OS ${osIdGerado} criada no banco de dados`);
        return osIdGerado;
      });

    } catch (error) {
      logger.error('Erro ao criar OS no banco:', error);
      throw error;
    }
  }

  async buscarTodas() {
    try {
      const query = `
        SELECT os.*, 
               COUNT(i.id) as total_itens,
               COUNT(img.id) as total_imagens
        FROM ordens_servico os
        LEFT JOIN itens_os i ON os.os_id = i.os_id
        LEFT JOIN imagens_os img ON os.os_id = img.os_id
        GROUP BY os.id
        ORDER BY os.created_at DESC
      `;
      
      const result = await database.query(query);
      
      return result.rows.map(row => ({
        id: row.id,
        osId: row.os_id,
        cliente: row.cliente,
        prazoEntrega: this.formatarData(row.prazo_entrega),
        formaPagamento: row.forma_pagamento,
        descontoGeral: parseFloat(row.desconto_geral),
        valorTotal: parseFloat(row.valor_total),
        pdfPath: row.pdf_path,
        totalItens: parseInt(row.total_itens),
        totalImagens: parseInt(row.total_imagens),
        dataCriacao: row.created_at,
        arquivo: `OS_${row.os_id}.pdf`
      }));

    } catch (error) {
      logger.error('Erro ao buscar todas as OS:', error);
      throw error;
    }
  }

  async buscarPorId(osId) {
    try {
      const osQuery = `
        SELECT * FROM ordens_servico WHERE os_id = $1
      `;
      
      const osResult = await database.query(osQuery, [osId]);
      
      if (osResult.rows.length === 0) {
        return null;
      }

      const os = osResult.rows[0];

      // Buscar itens
      const itensQuery = `
        SELECT * FROM itens_os WHERE os_id = $1 ORDER BY id
      `;
      const itensResult = await database.query(itensQuery, [osId]);

      // Buscar imagens
      const imagensQuery = `
        SELECT * FROM imagens_os WHERE os_id = $1 ORDER BY id
      `;
      const imagensResult = await database.query(imagensQuery, [osId]);

      return {
        id: os.id,
        osId: os.os_id,
        cliente: os.cliente,
        prazoEntrega: os.prazo_entrega,
        formaPagamento: os.forma_pagamento,
        descontoGeral: parseFloat(os.desconto_geral),
        valorTotal: parseFloat(os.valor_total),
        pdfPath: os.pdf_path,
        dataCriacao: os.created_at,
        itens: itensResult.rows.map(item => ({
          id: item.id,
          quantidade: item.quantidade,
          descricao: item.descricao,
          valorUnitario: parseFloat(item.valor_unitario),
          desconto: parseFloat(item.desconto),
          valorTotal: parseFloat(item.valor_total)
        })),
        imagens: imagensResult.rows.map(img => ({
          id: img.id,
          nomeArquivo: img.nome_arquivo,
          tipo: img.tipo,
          dadosBase64: img.dados_base64
        }))
      };

    } catch (error) {
      logger.error('Erro ao buscar OS por ID:', error);
      throw error;
    }
  }

  async atualizarPdfPath(osId, pdfPath) {
    try {
      const query = `
        UPDATE ordens_servico 
        SET pdf_path = $1, updated_at = CURRENT_TIMESTAMP
        WHERE os_id = $2
        RETURNING id
      `;
      
      const result = await database.query(query, [pdfPath, osId]);
      
      if (result.rows.length === 0) {
        throw new Error(`OS ${osId} não encontrada`);
      }

      logger.info(`PDF path atualizado para OS ${osId}: ${pdfPath}`);
      return true;

    } catch (error) {
      logger.error('Erro ao atualizar PDF path:', error);
      throw error;
    }
  }

  async deletar(osId) {
    try {
      return await database.transaction(async (client) => {
        // As foreign keys com CASCADE irão deletar automaticamente
        // itens_os e imagens_os relacionados
        const query = `DELETE FROM ordens_servico WHERE os_id = $1 RETURNING id`;
        const result = await client.query(query, [osId]);
        
        if (result.rows.length === 0) {
          throw new Error(`OS ${osId} não encontrada`);
        }

        logger.info(`OS ${osId} deletada do banco`);
        return true;
      });

    } catch (error) {
      logger.error('Erro ao deletar OS:', error);
      throw error;
    }
  }

  async contarTodas() {
    try {
      const query = `SELECT COUNT(*) as total FROM ordens_servico`;
      const result = await database.query(query);
      return parseInt(result.rows[0].total);
    } catch (error) {
      logger.error('Erro ao contar OS:', error);
      throw error;
    }
  }

  async buscarPorCliente(nomeCliente) {
    try {
      const query = `
        SELECT * FROM ordens_servico 
        WHERE LOWER(cliente) LIKE LOWER($1)
        ORDER BY created_at DESC
      `;
      
      const result = await database.query(query, [`%${nomeCliente}%`]);
      return result.rows;

    } catch (error) {
      logger.error('Erro ao buscar OS por cliente:', error);
      throw error;
    }
  }

  calcularValorItemComDesconto(quantidade, valorUnitario, desconto) {
    const valorBruto = quantidade * valorUnitario;
    const valorDesconto = (valorBruto * desconto) / 100;
    return valorBruto - valorDesconto;
  }

  formatarData(data) {
    if (!data) return null;
    return new Date(data).toLocaleDateString('pt-BR');
  }
}

module.exports = OSRepository;