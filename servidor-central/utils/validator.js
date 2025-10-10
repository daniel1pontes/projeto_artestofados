class Validator {
  
  static validarTelefone(telefone) {
    // Remove caracteres não numéricos
    const tel = telefone.replace(/\D/g, '');
    
    // Verifica se tem 10 ou 11 dígitos (com DDD)
    return tel.length >= 10 && tel.length <= 11;
  }

  static validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  static validarData(dataString) {
    // Formato: DD/MM/AAAA
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dataString.match(regex);
    
    if (!match) return false;
    
    const [, dia, mes, ano] = match;
    const data = new Date(ano, mes - 1, dia);
    
    return data.getDate() == dia && 
           data.getMonth() == mes - 1 && 
           data.getFullYear() == ano;
  }

  static validarDataHora(dataHoraString) {
    // Formato: DD/MM/AAAA HH:MM
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
    const match = dataHoraString.match(regex);
    
    if (!match) return false;
    
    const [, dia, mes, ano, hora, minuto] = match;
    
    // Validar data
    const data = new Date(ano, mes - 1, dia, hora, minuto);
    
    return data.getDate() == dia && 
           data.getMonth() == mes - 1 && 
           data.getFullYear() == ano &&
           data.getHours() == hora &&
           data.getMinutes() == minuto;
  }

  static validarValorMonetario(valor) {
    if (typeof valor === 'number') {
      return valor >= 0;
    }
    
    if (typeof valor === 'string') {
      // Remove R$, espaços e converte vírgula para ponto
      const valorNumerico = parseFloat(
        valor.replace(/[R$\s]/g, '').replace(',', '.')
      );
      return !isNaN(valorNumerico) && valorNumerico >= 0;
    }
    
    return false;
  }

  static validarCamposObrigatorios(objeto, campos) {
    const camposFaltantes = [];
    
    campos.forEach(campo => {
      if (!objeto[campo] || objeto[campo] === '') {
        camposFaltantes.push(campo);
      }
    });
    
    return {
      valido: camposFaltantes.length === 0,
      camposFaltantes
    };
  }

  static sanitizarTexto(texto) {
    if (typeof texto !== 'string') return '';
    
    return texto
      .trim()
      .replace(/[<>]/g, '') // Remove tags HTML básicas
      .substring(0, 500); // Limita tamanho
  }

  static sanitizarNumero(numero) {
    if (typeof numero === 'number') return numero;
    
    if (typeof numero === 'string') {
      return parseFloat(numero.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    }
    
    return 0;
  }

  static validarOS(dadosOS) {
    const erros = [];

    // Validar cliente
    if (!dadosOS.cliente || dadosOS.cliente.trim() === '') {
      erros.push('Nome do cliente é obrigatório');
    }

    // Validar prazo de entrega
    if (!dadosOS.prazoEntrega) {
      erros.push('Prazo de entrega é obrigatório');
    }

    // Validar forma de pagamento
    if (!dadosOS.formaPagamento) {
      erros.push('Forma de pagamento é obrigatória');
    }

    // Validar itens
    if (!Array.isArray(dadosOS.itens) || dadosOS.itens.length === 0) {
      erros.push('É necessário adicionar ao menos um item');
    } else {
      dadosOS.itens.forEach((item, index) => {
        if (!item.descricao || item.descricao.trim() === '') {
          erros.push(`Item ${index + 1}: Descrição é obrigatória`);
        }
        if (!item.quantidade || item.quantidade <= 0) {
          erros.push(`Item ${index + 1}: Quantidade inválida`);
        }
        if (!item.valorUnitario || item.valorUnitario <= 0) {
          erros.push(`Item ${index + 1}: Valor unitário inválido`);
        }
      });
    }

    return {
      valido: erros.length === 0,
      erros
    };
  }

  static formatarTelefone(telefone) {
    const tel = telefone.replace(/\D/g, '');
    
    if (tel.length === 11) {
      return `(${tel.substring(0, 2)}) ${tel.substring(2, 7)}-${tel.substring(7)}`;
    } else if (tel.length === 10) {
      return `(${tel.substring(0, 2)}) ${tel.substring(2, 6)}-${tel.substring(6)}`;
    }
    
    return telefone;
  }

  static formatarMoeda(valor) {
    return parseFloat(valor).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }
}

module.exports = Validator;