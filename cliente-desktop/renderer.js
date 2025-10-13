const { ipcRenderer, shell } = require('electron');

let SERVER_URL = 'http://localhost:4000';

// ==================== CONFIGURAÇÃO INICIAL ====================

async function loadConfig() {
    try {
        SERVER_URL = await ipcRenderer.invoke('get-server-url');
        document.getElementById('serverUrl').textContent = SERVER_URL;
        console.log('Conectado ao servidor:', SERVER_URL);
        updateServerStatus(true);
    } catch (error) {
        console.error('Erro ao carregar configuração:', error);
        updateServerStatus(false);
    }
}

function updateServerStatus(connected) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('serverStatus');
    
    if (connected) {
        statusDot.classList.remove('disconnected');
        statusText.textContent = 'Conectado';
    } else {
        statusDot.classList.add('disconnected');
        statusText.textContent = 'Desconectado';
    }
}

// ==================== NAVEGAÇÃO DE TABS ====================

function switchTab(tabName) {
    // Remover classe active de todos os conteúdos e botões
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    
    // Adicionar classe active ao tab selecionado
    document.getElementById(tabName).classList.add('active');
    
    // Encontrar e ativar o botão correto baseado no evento
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        // Fallback: encontrar pelo onclick
        const buttons = document.querySelectorAll('.nav-button');
        buttons.forEach(btn => {
            const onclickStr = btn.getAttribute('onclick');
            if (onclickStr && onclickStr.includes(tabName)) {
                btn.classList.add('active');
            }
        });
    }

    // Carregar dados específicos de cada tab
    if (tabName === 'chatbot') {
        loadAtendimentos();
    } else if (tabName === 'banco') {
        loadOSList();
    }
}

// ==================== FUNÇÕES DO CHATBOT ====================

async function checkBotStatus() {
    try {
        const response = await fetch(`${SERVER_URL}/api/bot/status`);
        const data = await response.json();
        
        const indicator = document.getElementById('botStatus');
        const text = document.getElementById('botStatusText');
        
        if (data.status === 'online' && data.connected) {
            indicator.className = 'status-indicator online';
            text.textContent = '✅ Bot conectado e operando';
            text.style.color = '#28a745';
        } else if (data.status === 'online') {
            indicator.className = 'status-indicator offline';
            text.textContent = '⏳ Bot iniciado, aguardando conexão...';
            text.style.color = '#ffc107';
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = '⚠️ Bot desconectado';
            text.style.color = '#dc3545';
        }

        updateServerStatus(true);
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        document.getElementById('botStatusText').textContent = '❌ Erro ao conectar com servidor';
        document.getElementById('botStatusText').style.color = '#dc3545';
        updateServerStatus(false);
    }
}

async function startBot() {
    try {
        showAlert('osAlert', 'Iniciando bot...', 'success');
        const response = await fetch(`${SERVER_URL}/api/bot/start`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showAlert('osAlert', data.message, 'success');
            checkBotStatus();
        } else {
            showAlert('osAlert', data.message, 'danger');
        }
    } catch (error) {
        showAlert('osAlert', 'Erro ao iniciar bot: ' + error.message, 'danger');
    }
}

async function stopBot() {
    try {
        const response = await fetch(`${SERVER_URL}/api/bot/stop`, { method: 'POST' });
        const data = await response.json();
        
        showAlert('osAlert', data.message, data.success ? 'success' : 'danger');
        checkBotStatus();
    } catch (error) {
        showAlert('osAlert', 'Erro ao parar bot: ' + error.message, 'danger');
    }
}

async function loadAtendimentos() {
    try {
        const response = await fetch(`${SERVER_URL}/api/atendimentos`);
        const data = await response.json();

        if (data.success && data.atendimentos.length > 0) {
            let html = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Data</th>
                            <th>Nome</th>
                            <th>Telefone</th>
                            <th>Serviço</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            data.atendimentos.forEach(atendimento => {
                html += `
                    <tr>
                        <td>${atendimento.id}</td>
                        <td>${atendimento.dataAtendimento}</td>
                        <td>${atendimento.nome}</td>
                        <td>${atendimento.telefone}</td>
                        <td>${atendimento.servico}</td>
                        <td>${atendimento.status}</td>
                    </tr>`;
            });
            
            html += `</tbody></table>`;
            document.getElementById('atendimentosTable').innerHTML = html;
        } else {
            document.getElementById('atendimentosTable').innerHTML = `
                <p style="text-align: center; padding: 40px; color: #6c757d;">
                    Nenhum atendimento registrado ainda
                </p>`;
        }
    } catch (error) {
        console.error('Erro ao carregar atendimentos:', error);
        document.getElementById('atendimentosTable').innerHTML = `
            <p style="text-align: center; padding: 40px; color: #dc3545;">
                Erro ao conectar com o servidor
            </p>`;
    }
}

// ==================== FUNÇÕES DO GERADOR DE OS ====================

function addItem() {
    const container = document.getElementById('itensContainer');
    const newItem = document.createElement('div');
    newItem.className = 'item-row';
    newItem.innerHTML = `
        <div>
            <label>Qtd *</label>
            <input type="number" class="form-control" name="quantidade" min="1" value="1" required>
        </div>
        <div>
            <label>Descrição *</label>
            <input type="text" class="form-control" name="descricao" required>
        </div>
        <div>
            <label>Valor Unitário *</label>
            <input type="number" class="form-control" name="valorUnitario" min="0" step="0.01" required>
        </div>
        <div>
            <label>Total</label>
            <input type="text" class="form-control" name="total" readonly>
        </div>
        <div>
            <button type="button" class="btn-remove" onclick="removeItem(this)">Remover</button>
        </div>
    `;
    container.appendChild(newItem);
    attachItemCalculation();
}

function removeItem(btn) {
    btn.closest('.item-row').remove();
}

function attachItemCalculation() {
    document.querySelectorAll('.item-row').forEach(row => {
        const qtd = row.querySelector('[name="quantidade"]');
        const valor = row.querySelector('[name="valorUnitario"]');
        const total = row.querySelector('[name="total"]');

        const calculate = () => {
            const t = (qtd.value || 0) * (valor.value || 0);
            total.value = formatMoney(t);
        };

        qtd.removeEventListener('input', calculate);
        valor.removeEventListener('input', calculate);
        
        qtd.addEventListener('input', calculate);
        valor.addEventListener('input', calculate);
    });
}

// Handler do formulário de OS
document.addEventListener('DOMContentLoaded', () => {
  const osForm = document.getElementById('osForm');
  if (osForm) {
    osForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const itens = [];
      document.querySelectorAll('.item-row').forEach(row => {
        itens.push({
          quantidade: parseInt(row.querySelector('[name="quantidade"]').value),
          descricao: row.querySelector('[name="descricao"]').value,
          valorUnitario: parseFloat(row.querySelector('[name="valorUnitario"]').value)
        });
      });

      const imagensInput = document.getElementById('imagens');
      const imagens = [];

      for (const file of imagensInput.files) {
        const base64 = await toBase64(file);
        imagens.push({ nome: file.name, data: base64 });
      }

      const dadosOS = {
        cliente: document.getElementById('nomeCliente').value,
        prazoEntrega: document.getElementById('prazoEntrega').value,
        formaPagamento: document.getElementById('formaPagamento').value,
        desconto: parseFloat(document.getElementById('desconto').value) || 0,
        itens: itens,
        imagens: imagens
      };

      try {
        showAlert('osAlert', 'Gerando Ordem de Serviço...', 'success');
        const response = await fetch(`${SERVER_URL}/api/os/criar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dadosOS)
        });
        const data = await response.json();

        if (data.success) {
          showAlert('osAlert', `✅ OS #${data.osId} gerada com sucesso! Valor: ${formatMoney(data.valorTotal)}`, 'success');
          osForm.reset();
          document.getElementById('itensContainer').innerHTML = '';
          addItem();
          loadOSList();
        } else {
          showAlert('osAlert', 'Erro: ' + data.message, 'danger');
        }
      } catch (error) {
        showAlert('osAlert', 'Erro ao gerar OS: ' + error.message, 'danger');
      }
    });
  }
});

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}


// ==================== FUNÇÕES DO BANCO DE OS ====================

async function loadOSList() {
    try {
        const response = await fetch(`${SERVER_URL}/api/os/listar`);
        const data = await response.json();

        if (data.success && data.ordens.length > 0) {
            let html = `
                <table class="table">
                    <thead>
                        <tr>
                            <th>OS ID</th>
                            <th>Arquivo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            data.ordens.forEach(os => {
                html += `
                    <tr>
                        <td>${os.osId}</td>
                        <td>${os.arquivo}</td>
                        <td>
                            <button class="btn btn-primary" onclick="visualizarOS('${os.osId}')">
                                Visualizar
                            </button>
                            <button class="btn btn-secondary" onclick="baixarOS('${os.osId}')">
                                Baixar
                            </button>
                        </td>
                    </tr>`;
            });
            
            html += `</tbody></table>`;
            document.getElementById('osListTable').innerHTML = html;
        } else {
            document.getElementById('osListTable').innerHTML = `
                <p style="text-align: center; padding: 40px; color: #6c757d;">
                    Nenhuma OS encontrada
                </p>`;
        }
    } catch (error) {
        console.error('Erro ao carregar OS:', error);
        document.getElementById('osListTable').innerHTML = `
            <p style="text-align: center; padding: 40px; color: #dc3545;">
                Erro ao conectar com o servidor
            </p>`;
    }
}

async function visualizarOS(osId) {
    try {
        // Abrir PDF no navegador externo
        const pdfUrl = `${SERVER_URL}/files/os/OS_${osId}.pdf`;
        shell.openExternal(pdfUrl);
    } catch (error) {
        alert('Erro ao visualizar OS: ' + error.message);
    }
}

async function baixarOS(osId) {
    try {
        // No Electron, podemos usar shell para abrir o download
        const downloadUrl = `${SERVER_URL}/api/os/download/${osId}`;
        shell.openExternal(downloadUrl);
    } catch (error) {
        alert('Erro ao baixar OS: ' + error.message);
    }
}

// Busca de OS
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchOS');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#osListTable tbody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }
});

// ==================== FUNÇÕES UTILITÁRIAS ====================

function showAlert(elementId, message, type) {
    const alertDiv = document.getElementById(elementId);
    if (alertDiv) {
        alertDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
        setTimeout(() => alertDiv.innerHTML = '', 5000);
    }
}

function formatMoney(value) {
    return parseFloat(value).toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
    });
}
// ==================== FUNÇÕES DE QR CODE ====================

let qrCodeInterval = null;

async function checkQRCode() {
    try {
        const response = await fetch(`${SERVER_URL}/api/bot/qrcode`);
        const data = await response.json();

        const qrCodeCard = document.getElementById('qrCodeCard');
        const qrCodeImage = document.getElementById('qrCodeImage');
        const qrCodeStatus = document.getElementById('qrCodeStatus');

        if (data.success && data.qrCode) {
            // Mostrar card do QR Code
            qrCodeCard.style.display = 'block';
            
            // Atualizar imagem do QR Code
            qrCodeImage.src = data.qrCode;
            qrCodeImage.style.display = 'block';
            
            // Atualizar status
            qrCodeStatus.textContent = '✅ QR Code disponível! Escaneie com seu WhatsApp.';
            qrCodeStatus.style.color = '#27ae60';
            
        } else {
            // Esconder card do QR Code
            qrCodeCard.style.display = 'none';
            qrCodeImage.src = '';
            qrCodeImage.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao verificar QR Code:', error);
    }
}

async function startBot() {
    try {
        showAlert('osAlert', 'Iniciando bot...', 'success');
        
        const response = await fetch(`${SERVER_URL}/api/bot/start`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showAlert('osAlert', data.message, 'success');
            checkBotStatus();
            
            // Iniciar verificação periódica do QR Code
            startQRCodePolling();
        } else {
            showAlert('osAlert', data.message, 'danger');
        }
    } catch (error) {
        showAlert('osAlert', 'Erro ao iniciar bot: ' + error.message, 'danger');
    }
}

async function stopBot() {
    try {
        const response = await fetch(`${SERVER_URL}/api/bot/stop`, { method: 'POST' });
        const data = await response.json();
        
        showAlert('osAlert', data.message, data.success ? 'success' : 'danger');
        checkBotStatus();
        
        // Parar verificação do QR Code
        stopQRCodePolling();
        
        // Esconder card do QR Code
        document.getElementById('qrCodeCard').style.display = 'none';
    } catch (error) {
        showAlert('osAlert', 'Erro ao parar bot: ' + error.message, 'danger');
    }
}

function startQRCodePolling() {
    // Parar polling anterior se existir
    stopQRCodePolling();
    
    // Verificar imediatamente
    checkQRCode();
    
    // Verificar a cada 2 segundos
    qrCodeInterval = setInterval(checkQRCode, 2000);
}

function stopQRCodePolling() {
    if (qrCodeInterval) {
        clearInterval(qrCodeInterval);
        qrCodeInterval = null;
    }
}

async function checkBotStatus() {
    try {
        const response = await fetch(`${SERVER_URL}/api/bot/status`);
        const data = await response.json();
        
        const indicator = document.getElementById('botStatus');
        const text = document.getElementById('botStatusText');
        
        if (data.status === 'online' && data.connected) {
            indicator.className = 'status-indicator online';
            text.textContent = '✅ Bot conectado e operando';
            text.style.color = '#28a745';
            
            // Parar verificação do QR Code quando conectado
            stopQRCodePolling();
            document.getElementById('qrCodeCard').style.display = 'none';
            
        } else if (data.status === 'online') {
            indicator.className = 'status-indicator offline';
            text.textContent = '⏳ Bot iniciado, aguardando conexão...';
            text.style.color = '#ffc107';
            
            // Continuar verificando QR Code
            if (!qrCodeInterval) {
                startQRCodePolling();
            }
            
        } else {
            indicator.className = 'status-indicator offline';
            text.textContent = '⚠️ Bot desconectado';
            text.style.color = '#dc3545';
            
            // Parar verificação do QR Code
            stopQRCodePolling();
            document.getElementById('qrCodeCard').style.display = 'none';
        }

        updateServerStatus(true);
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        document.getElementById('botStatusText').textContent = '❌ Erro ao conectar com servidor';
        document.getElementById('botStatusText').style.color = '#dc3545';
        updateServerStatus(false);
        
        stopQRCodePolling();
    }
}

// ==================== INICIALIZAÇÃO ====================

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    console.log('Aplicação iniciada');
    
    // Carregar configuração
    loadConfig().then(() => {
        // Verificar status do bot
        checkBotStatus();
        setInterval(checkBotStatus, 10000);
        
        // Inicializar cálculo de itens
        attachItemCalculation();
        
        // Carregar dados iniciais
        loadAtendimentos();
    });
});

// Atalhos de teclado
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + 1/2/3 para trocar tabs
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case '1':
                document.querySelector('[onclick*="chatbot"]').click();
                break;
            case '2':
                document.querySelector('[onclick*="gerador"]').click();
                break;
            case '3':
                document.querySelector('[onclick*="banco"]').click();
                break;
        }
    }
});

// Tratamento de erros global
window.addEventListener('error', (e) => {
    console.error('Erro capturado:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Promise rejeitada:', e.reason);
});

// Exportar funções para uso no HTML
window.switchTab = switchTab;
window.startBot = startBot;
window.stopBot = stopBot;
window.addItem = addItem;
window.removeItem = removeItem;
window.visualizarOS = visualizarOS;
window.baixarOS = baixarOS;