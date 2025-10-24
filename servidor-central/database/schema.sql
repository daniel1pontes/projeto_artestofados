-- Schema do banco de dados Artestofados

-- Tabela de atendimentos
CREATE TABLE IF NOT EXISTS atendimentos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    servico VARCHAR(255) NOT NULL,
    detalhes TEXT,
    data_atendimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Em andamento',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de ordens de serviço
CREATE TABLE IF NOT EXISTS ordens_servico (
    id SERIAL PRIMARY KEY,
    os_id VARCHAR(50) UNIQUE NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    prazo_entrega DATE NOT NULL,
    forma_pagamento VARCHAR(100) NOT NULL,
    desconto_geral DECIMAL(5,2) DEFAULT 0,
    valor_total DECIMAL(10,2) NOT NULL,
    pdf_path TEXT,
    arquivo VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de itens das ordens de serviço
CREATE TABLE IF NOT EXISTS os_itens (
    id SERIAL PRIMARY KEY,
    os_id VARCHAR(50) NOT NULL REFERENCES ordens_servico(os_id) ON DELETE CASCADE,
    quantidade INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    valor_unitario DECIMAL(10,2) NOT NULL,
    desconto DECIMAL(5,2) DEFAULT 0,
    valor_total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de imagens das ordens de serviço
CREATE TABLE IF NOT EXISTS os_imagens (
    id SERIAL PRIMARY KEY,
    os_id VARCHAR(50) NOT NULL REFERENCES ordens_servico(os_id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de usuários com bot pausado
CREATE TABLE IF NOT EXISTS usuarios_pausados (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    pausado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    retoma_em TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_atendimentos_telefone ON atendimentos(telefone);
CREATE INDEX IF NOT EXISTS idx_atendimentos_data ON atendimentos(data_atendimento DESC);
CREATE INDEX IF NOT EXISTS idx_os_cliente ON ordens_servico(cliente);
CREATE INDEX IF NOT EXISTS idx_os_created ON ordens_servico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_os_itens_os_id ON os_itens(os_id);
CREATE INDEX IF NOT EXISTS idx_os_imagens_os_id ON os_imagens(os_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_pausados_user_id ON usuarios_pausados(user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_pausados_retoma ON usuarios_pausados(retoma_em);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_atendimentos_updated_at 
    BEFORE UPDATE ON atendimentos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ordens_servico_updated_at 
    BEFORE UPDATE ON ordens_servico 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();