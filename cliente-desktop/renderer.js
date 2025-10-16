// cliente-desktop/renderer.js - VERSÃO COMPLETA COM Z-API
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
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName).classList.add('active');
    
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else {
        const buttons = document.querySelectorAll('.nav-button');
        buttons.forEach(btn => {
            const onclickStr = btn.getAttribute('onclick');
            if (onclickStr && onclickStr.includes(tabName)) {
                btn.classList.add('active');
            }
        });
    }

    if (tabName === 'chatbot') {
        loadAtendimentos();
        checkBotStatus();
        loadPausedUsers();
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
        const connectBtn = document.getElementById('connectWhatsAppBtn');
        const controlButtons = document.getElementById('botControlButtons');
        const qrCodeCard = document.getElementById('qrCodeCard');
        
        if (data.status === 'online' && data.connected) {
            // Bot conectado e operando
            indicator.className = 'status-indicator online';
            text.textContent = '✅ Bot conectado e operando';
            text.style.color = '#28a745';
            
            connectBtn.style.display = 'none';
            controlButtons.style.display = 'flex';
            qrCodeCard.style.display = 'none';
            
            stopQRCodePolling();
            loadPausedUsers();
            
        } else if (data.status === 'online') {
            // Bot iniciado, aguardando conexão (mostrando QR Code)
            indicator.className = 'status-indicator offline';
            text.textContent = '⏳ Aguardando leitura do QR Code...';
            text.style.color = '#ffc107';
            
            connectBtn.style.display = 'none';
            controlButtons.style.display = 'none';
            
            if (!qrCodeInterval) {
                startQRCodePolling();
            }
            
        } else {
            // Bot desconectado
            indicator.className = 'status-indicator offline';
            text.textContent = '⚠️ Bot desconectado';
            text.style.color = '#dc3545';
            
            connectBtn.style.display = 'block';
            controlButtons.style.display = 'none';
            qrCodeCard.style.display = 'none';
            
            stopQRCodePolling();
        }

        updateServerStatus(true);
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        document.getElementById('botStatusText').textContent = '❌ Erro ao conectar com servidor';
        document.getElementById('botStatusText').style.color = '#dc3545';
        updateServerStatus(false);
        
        document.getElementById('connectWhatsAppBtn').style.display = 'block';
        document.getElementById('botControlButtons').style.display = 'none';
        stopQRCodePolling();
    }
}

async function connectWhatsApp() {
    try {
        showAlert('chatbotAlert', 'Iniciando conexão com WhatsApp via Z-API...', 'success');
        
        const response = await fetch(`${SERVER_URL}/api/bot/start`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showAlert('chatbotAlert', data.message, 'success');
            
            document.getElementById('connectWhatsAppBtn').style.display = 'none';
            
            startQRCodePolling();
            checkBotStatus();
        } else {
            showAlert('chatbotAlert', data.message, 'danger');
        }
    } catch (error) {
        showAlert('chatbotAlert', 'Erro ao conectar: ' + error.message, 'danger');
    }
}

async function disconnectBot() {
    try {
        const confirmacao = confirm(
            '⚠️ DESCONECTAR BOT DO WHATSAPP\n\n' +
            'Isso irá:\n' +
            '• Desconectar completamente do WhatsApp\n' +
            '• Parar de responder TODAS as mensagens\n' +
            '• Limpar a sessão atual\n\n' +
            'Você precisará escanear o QR Code novamente.\n\n' +
            'Tem certeza?'
        );
        
        if (!confirmacao) return;
        
        showAlert('chatbotAlert', 'Desconectando bot...', 'warning');
        
        const response = await fetch(`${SERVER_URL}/api/bot/stop`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showAlert('chatbotAlert', '🔌 ' + data.message, 'success');
            
            stopQRCodePolling();
            
            document.getElementById('qrCodeCard').style.display = 'none';
            document.getElementById('botControlButtons').style.display = 'none';
            document.getElementById('connectWhatsAppBtn').style.display = 'block';
            
            if (document.getElementById('pausedUsersTable')) {
                document.getElementById('pausedUsersTable').innerHTML = `
                    <p style="text-align: center; padding: 20px; color: #6c757d;">
                        Bot desconectado
                    </p>`;
            }
            
            checkBotStatus();
        } else {
            showAlert('chatbotAlert', '⚠️ ' + data.message, 'danger');
        }
    } catch (error) {
        showAlert('chatbotAlert', '❌ Erro ao desconectar: ' + error.message, 'danger');
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

// ==================== FUNÇÕES DE QR CODE ====================

let qrCodeInterval = null;

async function checkQRCode() {
    try {
        console.log('🔍 Verificando QR Code...');
        
        const response = await fetch(`${SERVER_URL}/api/bot/qrcode`);
        const data = await response.json();

        const qrCodeCard = document.getElementById('qrCodeCard');
        const qrCodeImage = document.getElementById('qrCodeImage');
        const qrCodeStatus = document.getElementById('qrCodeStatus');

        if (data.success && data.qrCode) {
            console.log('✅ QR Code disponível!');
            
            qrCodeCard.style.display = 'block';
            qrCodeImage.src = data.qrCode;
            qrCodeImage.style.display = 'block';
            qrCodeStatus.textContent = '📱 QR Code disponível! Escaneie com seu WhatsApp.';
            qrCodeStatus.style.color = '#27ae60';
            qrCodeStatus.style.fontWeight = 'bold';
            
        } else {
            console.log('⏳ QR Code ainda não disponível...');
            
            if (qrCodeCard.style.display !== 'none') {
                qrCodeStatus.textContent = '⏳ Aguardando geração do QR Code...';
                qrCodeStatus.style.color = '#ffc107';
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar QR Code:', error);
    }
}

function startQRCodePolling() {
    console.log('🚀 Iniciando polling do QR Code...');
    
    stopQRCodePolling();
    
    const qrCodeCard = document.getElementById('qrCodeCard');
    qrCodeCard.style.display = 'block';
    
    document.getElementById('qrCodeStatus').textContent = '⏳ Conectando ao Z-API...';
    document.getElementById('qrCodeStatus').style.color = '#ffc107';
    
    checkQRCode();
    
    qrCodeInterval = setInterval(() => {
        checkQRCode();
        checkBotStatus();
    }, 3000);
    
    console.log('✅ Polling do QR Code iniciado (a cada 3 segundos)');
}

function stopQRCodePolling() {
    if (qrCodeInterval) {
        console.log('⏹️ Parando polling do QR Code');
        clearInterval(qrCodeInterval);
        qrCodeInterval = null;
    }
}

// ==================== FUNÇÕES DE USUÁRIOS PAUSADOS ====================

async function loadPausedUsers() {
    try {
        const response = await fetch(`${SERVER_URL}/api/bot/paused-users`);
        const data = await response.json();
        
        const container = document.getElementById('pausedUsersTable');
        
        if (!container) {
            console.warn('Elemento pausedUsersTable não encontrado');
            return;
        }
        
        if (data.success && data.pausedUsers && data.pausedUsers.length > 0) {
            let html = `
                <div style="margin: 15px 0; padding: 10px; background: #fff3cd; border-radius: 5px; border-left: 4px solid #ffc107;">
                    <strong>ℹ️ Informação:</strong> Estes usuários têm o bot pausado porque você respondeu manualmente no WhatsApp.
                </div>
                <table class="table" style="margin-top: 15px;">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Telefone</th>
                            <th>Pausado há</th>
                            <th>Retoma em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            data.pausedUsers.forEach(user => {
                const pausedAt = new Date(user.pausedAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const minutes = user.minutesRemaining;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                
                let timeRemaining = '';
                if (hours > 0) {
                    timeRemaining = `${hours}h ${mins}min`;
                } else {
                    timeRemaining = `${mins}min`;
                }
                
                html += `
                    <tr>
                        <td><strong>${user.userName}</strong></td>
                        <td><code>${user.userId}</code></td>
                        <td>${pausedAt}</td>
                        <td>
                            <span style="color: ${minutes > 60 ? '#28a745' : '#ffc107'}; font-weight: bold;">
                                ${timeRemaining}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-primary" 
                                    onclick="reativarUsuario('${user.userId}', '${user.userName}')"
                                    style="font-size: 0.85em; padding: 6px 12px;">
                                ▶️ Reativar Agora
                            </button>
                        </td>
                    </tr>`;
            });
            
            html += `</tbody></table>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6c757d;">
                    <p style="font-size: 1.2em; margin-bottom: 10px;">✅ Nenhum usuário com bot pausado</p>
                    <p style="font-size: 0.9em;">Quando você responder manualmente no WhatsApp, o cliente aparecerá aqui.</p>
                </div>`;
        }
    } catch (error) {
        console.error('Erro ao carregar usuários pausados:', error);
        const container = document.getElementById('pausedUsersTable');
        if (container) {
            container.innerHTML = `
                <p style="text-align: center; padding: 20px; color: #dc3545;">
                    ❌ Erro ao carregar lista de usuários
                </p>`;
        }
    }
}

async function reativarUsuario(userId, userName) {
    try {
        const confirmacao = confirm(
            `Reativar bot para ${userName}?\n\n` +
            `O bot voltará a responder automaticamente as mensagens deste cliente.`
        );
        
        if (!confirmacao) return;
        
        const response = await fetch(`${SERVER_URL}/api/bot/resume-user/${userId}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showAlert('chatbotAlert', `✅ Bot reativado para ${userName}!`, 'success');
            loadPausedUsers();
        } else {
            showAlert('chatbotAlert', '⚠️ ' + data.message, 'warning');
        }
    } catch (error) {
        showAlert('chatbotAlert', '❌ Erro: ' + error.message, 'danger');
    }
}

function showPauseHelp() {
    const helpMessage = `
╔═══════════════════════════════════════════╗
║  SISTEMA DE PAUSA AUTOMÁTICA              ║
╚═══════════════════════════════════════════╝

🔹 COMO FUNCIONA:

1️⃣ Cliente envia mensagem
   → Bot responde automaticamente

2️⃣ VOCÊ responde manualmente no WhatsApp Web
   → Bot PAUSA automaticamente por 2 horas
   → Cliente aparece na lista acima

3️⃣ Durante as 2 horas:
   → Bot NÃO responde esse cliente
   → Você pode conversar normalmente
   → Outros clientes continuam sendo atendidos

4️⃣ Após 2 horas:
   → Bot volta a funcionar automaticamente
   → Cliente sai da lista

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔹 REATIVAR ANTES DAS 2 HORAS:

• Clique em "▶️ Reativar Agora" na lista
• Bot volta a responder imediatamente

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔹 CLIENTE PODE REATIVAR:

O cliente pode enviar: #ativar
→ Bot volta a responder mesmo pausado

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ VANTAGENS:

• Não precisa pausar o bot inteiro
• Outros clientes continuam sendo atendidos
• Você conversa livremente sem interferência
• Controle total sobre cada cliente
    `;
    
    alert(helpMessage);
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
      const imagens = [...imagensSelecionadas];

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
          imagensSelecionadas = [];
          document.getElementById('imagensPreview').innerHTML = '';
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

let imagensSelecionadas = [];

document.addEventListener('DOMContentLoaded', () => {
  const imagensInput = document.getElementById('imagens');
  const imagensPreview = document.getElementById('imagensPreview');

  if (imagensInput) {
    imagensInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      
      for (const file of files) {
        try {
          const base64 = await toBase64(file);
          
          imagensSelecionadas.push({
            nome: file.name,
            data: base64
          });

          const previewItem = document.createElement('div');
          previewItem.style.cssText = 'position: relative; width: 100px; height: 100px; border: 2px solid #ddd; border-radius: 5px; overflow: hidden;';
          
          const img = document.createElement('img');
          img.src = base64;
          img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
          
          const removeBtn = document.createElement('button');
          removeBtn.textContent = '×';
          removeBtn.type = 'button';
          removeBtn.style.cssText = 'position: absolute; top: 2px; right: 2px; background: red; color: white; border: none; border-radius: 50%; width: 25px; height: 25px; cursor: pointer; font-size: 18px; line-height: 1;';
          
          const imagemIndex = imagensSelecionadas.length - 1;
          removeBtn.onclick = () => {
            imagensSelecionadas.splice(imagemIndex, 1);
            previewItem.remove();
            atualizarIndices();
          };
          
          previewItem.appendChild(img);
          previewItem.appendChild(removeBtn);
          imagensPreview.appendChild(previewItem);
          
        } catch (error) {
          console.error('Erro ao processar imagem:', error);
        }
      }
      
      imagensInput.value = '';
    });
  }

  function atualizarIndices() {
    const previews = imagensPreview.children;
    for (let i = 0; i < previews.length; i++) {
      const removeBtn = previews[i].querySelector('button');
      removeBtn.onclick = () => {
        imagensSelecionadas.splice(i, 1);
        previews[i].remove();
        atualizarIndices();
      };
    }
  }
});

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
                            <th>#</th>
                            <th>Cliente</th>
                            <th>OS ID</th>
                            <th>Arquivo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
            data.ordens.forEach((os, index) => {
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${os.cliente || 'Desconhecido'}</td>
                        <td>${os.osId}</td>
                        <td>${os.arquivo}</td>
                        <td>
                            <button class="btn btn-primary" onclick="visualizarOS('${os.osId}')">
                                VISUALIZAR
                            </button>
                            <button class="btn btn-secondary" onclick="baixarOS('${os.osId}')">
                                BAIXAR
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
        const pdfUrl = `${SERVER_URL}/files/os/OS_${osId}.pdf`;
        shell.openExternal(pdfUrl);
    } catch (error) {
        alert('Erro ao visualizar OS: ' + error.message);
    }
}

async function baixarOS(osId) {
    try {
        const downloadUrl = `${SERVER_URL}/api/os/download/${osId}`;
        shell.openExternal(downloadUrl);
    } catch (error) {
        alert('Erro ao baixar OS: ' + error.message);
    }
}

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

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Aplicação iniciada');
    
    loadConfig().then(() => {
        checkBotStatus();
        setInterval(checkBotStatus, 10000);
        
        setInterval(loadPausedUsers, 30000);
        
        attachItemCalculation();
        loadAtendimentos();
    });
});

document.addEventListener('keydown', (e) => {
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

window.addEventListener('error', (e) => {
    console.error('Erro capturado:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Promise rejeitada:', e.reason);
});

// Exportar funções para uso no HTML
window.switchTab = switchTab;
window.connectWhatsApp = connectWhatsApp;
window.disconnectBot = disconnectBot;
window.addItem = addItem;
window.removeItem = removeItem;
window.visualizarOS = visualizarOS;
window.baixarOS = baixarOS;
window.loadPausedUsers = loadPausedUsers;
window.reativarUsuario = reativarUsuario;
window.showPauseHelp = showPauseHelp;