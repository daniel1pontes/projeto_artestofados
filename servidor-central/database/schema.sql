-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de atendimentos
CREATE TABLE atendimentos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    servico VARCHAR(100) NOT NULL,
    detalhes TEXT,
    data_atendimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_agendamento VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Pendente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de ordens de serviço
CREATE TABLE ordens_servico (
    id SERIAL PRIMARY KEY,
    os_id VARCHAR(100) UNIQUE NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    prazo_entrega DATE NOT NULL,
    forma_pagamento VARCHAR(100) NOT NULL,
    desconto_geral DECIMAL(5,2) DEFAULT 0,
    valor_total DECIMAL(10,2) NOT NULL,
    pdf_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de itens da OS
CREATE TABLE itens_os (
    id SERIAL PRIMARY KEY,
    os_id VARCHAR(100) REFERENCES ordens_servico(os_id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    valor_unitario DECIMAL(10,2) NOT NULL,
    desconto DECIMAL(5,2) DEFAULT 0,
    valor_total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de imagens das OS
CREATE TABLE imagens_os (
    id SERIAL PRIMARY KEY,
    os_id VARCHAR(100) REFERENCES ordens_servico(os_id) ON DELETE CASCADE,
    nome_arquivo VARCHAR(255) NOT NULL,
    tipo VARCHAR(10) NOT NULL, -- 'item' ou 'anexo'
    dados_base64 TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de usuários pausados do bot
CREATE TABLE usuarios_pausados (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    pausado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pausa_ate TIMESTAMP NOT NULL,
    ativo BOOLEAN DEFAULT true
);

-- Índices para melhor performance
CREATE INDEX idx_atendimentos_telefone ON atendimentos(telefone);
CREATE INDEX idx_atendimentos_data ON atendimentos(data_atendimento);
CREATE INDEX idx_os_cliente ON ordens_servico(cliente);
CREATE INDEX idx_os_data ON ordens_servico(created_at);
CREATE INDEX idx_itens_os_id ON itens_os(os_id);
CREATE INDEX idx_imagens_os_id ON imagens_os(os_id);
CREATE INDEX idx_usuarios_pausados_ativo ON usuarios_pausados(ativo);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_atendimentos_updated_at 
    BEFORE UPDATE ON atendimentos 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ordens_servico_updated_at 
    BEFORE UPDATE ON ordens_servico 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();