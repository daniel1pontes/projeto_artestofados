const database = require('../config');
const logger = require('../../utils/logger');

class OSRepository {
  async criar(dados) {
    try {
      return await database.transaction(async (client) => {
        const osQuery = `
          INSERT INTO ordens_servico 
          (os_id, cliente, prazo_entrega, forma_pagamento, desconto_geral, valor_total, pdf_path, arquivo)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `;

        const osValues = [
          dados.osId,
          dados.cliente,
          dados.prazoEntrega,
          dados.formaPagamento,
          dados.descontoGeral || 0,
          dados.valorTotal,
          dados.pdfPath,
          `OS_${dados.osId}.pdf`
        ];

        const osResult = await client.query(osQuery, osValues);

        if (dados.itens && dados.itens.length > 0) {
          for (const item of dados.itens) {
            const valorItem = item.quantidade * item.valorUnitario;
            const descontoItem = (valorItem * (item.desconto || 0)) / 100;
            const valorTotal = valorItem - descontoItem;

            const itemQuery = `
              INSERT INTO os_itens 
              (os_id, quantidade, descricao, valor_unitario, desconto, valor_total)
              VALUES ($1, $2, $3, $4, $5, $6)
            `;

            await client.query(itemQuery, [
              dados.osId,
              item.quantidade,
              item.descricao,
              item.valorUnitario,
              item.desconto || 0,
              valorTotal
            ]);
          }
        }

        if (dados.imagens && dados.imagens.length > 0) {
          for (const imagem of dados.imagens) {
            const imagemQuery = `
              INSERT INTO os_imagens (os_id, nome, data)
              VALUES ($1, $2, $3)
            `;

            await client.query(imagemQuery, [
              dados.osId,
              imagem.nome,
              imagem.data
            ]);
          }
        }

        logger.info(`OS ${dados.osId} criada com sucesso no banco`);
        return osResult.rows[0];
      });
    } catch (error) {
      logger.error('Erro ao criar OS no banco:', error);
      throw error;
    }
  }

  async buscarTodas() {
    try {
      const query = `
        SELECT 
          os.id,
          os.os_id as "osId",
          os.cliente,
          os.prazo_entrega as "prazoEntrega",
          os.forma_pagamento as "formaPagamento",
          os.desconto_geral as "descontoGeral",
          os.valor_total as "valorTotal",
          os.arquivo,
          os.created_at as "criadoEm",
          COUNT(DISTINCT osi.id) as "totalItens",
          COUNT(DISTINCT img.id) as "totalImagens"
        FROM ordens_servico os
        LEFT JOIN os_itens osi ON os.os_id = osi.os_id
        LEFT JOIN os_imagens img ON os.os_id = img.os_id
        GROUP BY os.id, os.os_id, os.cliente, os.prazo_entrega, os.forma_pagamento, 
                 os.desconto_geral, os.valor_total, os.arquivo, os.created_at
        ORDER BY os.created_at DESC
      `;

      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Erro ao buscar todas as OS:', error);
      throw error;
    }
  }

  async buscarPorId(osId) {
    try {
      const osQuery = `
        SELECT 
          os.*,
          os.os_id as "osId",
          os.prazo_entrega as "prazoEntrega",
          os.forma_pagamento as "formaPagamento",
          os.desconto_geral as "descontoGeral",
          os.valor_total as "valorTotal",
          os.pdf_path as "pdfPath"
        FROM ordens_servico os
        WHERE os.os_id = $1
      `;

      const osResult = await database.query(osQuery, [osId]);

      if (osResult.rows.length === 0) {
        return null;
      }

      const os = osResult.rows[0];

      const itensQuery = `
        SELECT 
          quantidade,
          descricao,
          valor_unitario as "valorUnitario",
          desconto,
          valor_total as "valorTotal"
        FROM os_itens
        WHERE os_id = $1
        ORDER BY id
      `;

      const itensResult = await database.query(itensQuery, [osId]);
      os.itens = itensResult.rows;

      const imagensQuery = `
        SELECT nome, data
        FROM os_imagens
        WHERE os_id = $1
        ORDER BY id
      `;

      const imagensResult = await database.query(imagensQuery, [osId]);
      os.imagens = imagensResult.rows;

      return os;
    } catch (error) {
      logger.error(`Erro ao buscar OS ${osId}:`, error);
      throw error;
    }
  }

  async buscarPorCliente(nomeCliente) {
    try {
      const query = `
        SELECT 
          os_id as "osId",
          cliente,
          prazo_entrega as "prazoEntrega",
          valor_total as "valorTotal",
          arquivo,
          created_at as "criadoEm"
        FROM ordens_servico
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

  async deletar(osId) {
    try {
      const query = `
        DELETE FROM ordens_servico
        WHERE os_id = $1
        RETURNING *
      `;

      const result = await database.query(query, [osId]);

      if (result.rowCount === 0) {
        throw new Error(`OS ${osId} não encontrada`);
      }

      logger.info(`OS ${osId} deletada do banco`);
      return true;
    } catch (error) {
      logger.error(`Erro ao deletar OS ${osId}:`, error);
      throw error;
    }
  }

  async contarTodas() {
    try {
      const query = 'SELECT COUNT(*) as total FROM ordens_servico';
      const result = await database.query(query);
      return parseInt(result.rows[0].total);
    } catch (error) {
      logger.error('Erro ao contar OS:', error);
      return 0;
    }
  }

  async atualizar(osId, dados) {
    try {
      const campos = [];
      const valores = [];
      let contador = 1;

      if (dados.cliente) {
        campos.push(`cliente = $${contador++}`);
        valores.push(dados.cliente);
      }

      if (dados.prazoEntrega) {
        campos.push(`prazo_entrega = $${contador++}`);
        valores.push(dados.prazoEntrega);
      }

      if (dados.formaPagamento) {
        campos.push(`forma_pagamento = $${contador++}`);
        valores.push(dados.formaPagamento);
      }

      if (dados.valorTotal !== undefined) {
        campos.push(`valor_total = $${contador++}`);
        valores.push(dados.valorTotal);
      }

      if (campos.length === 0) {
        throw new Error('Nenhum campo para atualizar');
      }

      valores.push(osId);

      const query = `
        UPDATE ordens_servico
        SET ${campos.join(', ')}
        WHERE os_id = $${contador}
        RETURNING *
      `;

      const result = await database.query(query, valores);

      if (result.rowCount === 0) {
        throw new Error(`OS ${osId} não encontrada`);
      }

      logger.info(`OS ${osId} atualizada no banco`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Erro ao atualizar OS ${osId}:`, error);
      throw error;
    }
  }
}

module.exports = OSRepository;