const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, os.tmpdir());
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = multer({ storage: storage });

let connectedNumber = null;
let qrCodeDataURL = null;
let isConnected = false;
let client = null;
let isReconnecting = false;
let connectionStatus = 'INITIALIZING';
let loadingPercent = 0;
let initWatchdog = null; // Cão de Guarda contra travamentos na inicialização

// Fila global de leads lidos automaticamente
global.autoLeadsQueue = [];

// Função auxiliar blindada para identificar e enfileirar leads
const processAndQueueLead = (msgId, text) => {
    if (!text) return;
    const textLower = text.toLowerCase();
    const isLead = text.includes('NOVO LEAD GERADO') ||
                  text.includes('NOVO LEAD') ||
                  (textLower.includes('nome:') && textLower.includes('telefone:')) ||
                  (textLower.includes('nome ') && textLower.includes('telefone ') && textLower.includes('email'));

    if (isLead) {
        const exists = global.autoLeadsQueue.some(l => l.id === msgId);
        if (!exists) {
            console.log('🎯 [AUTO-IMPORT] Lead identificado e adicionado à fila!');
            global.autoLeadsQueue.push({
                id: msgId,
                text: text,
                timestamp: new Date().toISOString()
            });
        }
    }
};

// Limpeza profunda garantida para forçar a desconexão e exibir QR Code
const forceCleanSession = () => {
    try {
        // Correção crítica: process.cwd() encontra a pasta raiz real do Electron instalado, __dirname falharia
        const authPath = path.join(process.cwd(), '.wwebjs_auth');
        const cachePath = path.join(process.cwd(), '.wwebjs_cache');
        
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        if (fs.existsSync(cachePath)) {
            fs.rmSync(cachePath, { recursive: true, force: true });
        }
        console.log('🗑️ Pastas de sessão removidas com sucesso para forçar reconexão.');
    } catch (e) {
        console.warn('⚠️ Aviso ao tentar remover pastas de sessão:', e.message);
    }
};

const limparSessaoEReiniciar = () => {
    if (isReconnecting) return;
    isReconnecting = true;
    connectionStatus = 'INITIALIZING';
    qrCodeDataURL = null;
    isConnected = false;

    console.log('🧹 Detectado travamento fatal no Puppeteer. Iniciando Auto-Recovery Seguro...');
    
    if (client) {
        try { client.destroy().catch(() => {}); } catch (e) {}
        client = null;
    }

    forceCleanSession();

    // Taskkill focado exclusivamente nos processos do Puppeteer identificados
    exec('taskkill /F /IM msedgewebview2.exe /T', (err, stdout, stderr) => {
        console.log('🔫 Processos zumbis do WebView2 encerrados. Reiniciando cliente em 3 segundos...');
        setTimeout(() => {
            isReconnecting = false;
            handleReconnection();
        }, 3000);
    });
};

process.on('uncaughtException', (err) => {
    console.error('🔥 Erro Crítico Não Tratado no Sistema:', err.message);
    if (err.message.includes('Execution context was destroyed') || err.message.includes('detached Frame') || err.message.includes('Target closed') || err.message.includes('timeout') || err.message.includes('protocolTimeout')) {
        limparSessaoEReiniciar();
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('🔥 Rejeição de Promessa Não Tratada:', reason?.message || reason);
    if (reason?.message?.includes('Execution context was destroyed') || reason?.message?.includes('detached Frame') || reason?.message?.includes('Target closed') || reason?.message?.includes('timeout') || reason?.message?.includes('protocolTimeout')) {
        limparSessaoEReiniciar();
    }
});

// Procura o Edge ou Chrome nativo da máquina do usuário
const getLocalBrowserPath = () => {
    const platform = os.platform();
    let foundPath = null;

    if (platform === 'win32') {
        const paths = [
            // PRIORIDADE 1: Microsoft Edge (Nativo do Windows 10/11)
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            // PRIORIDADE 2: Google Chrome
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            // PRIORIDADE 3: Brave Browser
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ];

        for (const browserPath of paths) {
            if (fs.existsSync(browserPath)) {
                console.log(`✅ [Navegador Detectado] Usando: ${browserPath}`);
                foundPath = browserPath;
                break;
            }
        }
    } else if (platform === 'darwin') { // Mac
        const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        if (fs.existsSync(macPath)) {
            foundPath = macPath;
        }
    }

    if (!foundPath) {
        console.error("❌ [ERRO CRÍTICO] Nenhum navegador compatível (Edge, Chrome, Brave) foi encontrado nesta máquina!");
    }

    return foundPath;
};

const createWhatsAppClient = () => {
    console.log('\n🔄 Inicializando cliente do WhatsApp...');
    forceCleanSession();
    connectionStatus = 'INITIALIZING';

    // 🐕 WATCHDOG TIMER: Se ficar travado em INITIALIZING por mais de 45 seg, força a limpeza
    if (initWatchdog) clearTimeout(initWatchdog);
    initWatchdog = setTimeout(() => {
        if (connectionStatus === 'INITIALIZING') {
            console.error('⏳ [WATCHDOG] Demora excessiva na inicialização (Travamento do Chrome). Forçando Auto-Recovery Seguro...');
            limparSessaoEReiniciar();
        }
    }, 45000); // 45 Segundos de tolerância

    const newClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            executablePath: getLocalBrowserPath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-infobars',
                '--disable-session-crashed-bubble'
            ]
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1010703399-alpha.html',
        }
    });

    newClient.on('qr', (qr) => {
        if (isConnected) return; // BLINDAGEM: Ignora se já conectou
        if (initWatchdog) clearTimeout(initWatchdog);
        isConnected = false;
        connectedNumber = null;
        connectionStatus = 'QR_CODE';
        console.log('📱 QR Code gerado! Aguardando leitura pelo aplicativo do celular...');
        qrcode.toDataURL(qr, (err, url) => { qrCodeDataURL = url; });
    });

    newClient.on('authenticated', () => {
        if (isConnected) return; // BLINDAGEM: Não retrocede se já conectou
        if (initWatchdog) clearTimeout(initWatchdog);
        if (connectionStatus !== 'AUTHENTICATING') {
            console.log('✅ QR Code lido! Autenticando no WhatsApp...');
        }
        connectionStatus = 'AUTHENTICATING';
        qrCodeDataURL = null;
    });

    newClient.on('loading_screen', (percent, message) => {
        if (isConnected) return; // BLINDAGEM: Ignora sincronizações em segundo plano após já estar pronto
        console.log(`⏳ Baixando mensagens e sincronizando... ${percent}%`);
        connectionStatus = 'LOADING';
        loadingPercent = percent;
    });

    newClient.on('ready', () => {
        if (initWatchdog) clearTimeout(initWatchdog);
        isConnected = true;
        connectionStatus = 'READY';
        qrCodeDataURL = null;
        if (newClient.info && newClient.info.wid) {
            connectedNumber = newClient.info.wid.user;
        }
        console.log(`🤖 Robô conectado com sucesso! Número vinculado: +${connectedNumber}`);
    });

    // ==========================================
    // ESCUTA DE MENSAGENS PARA AUTO-IMPORTAÇÃO
    // ==========================================
    newClient.on('message', async (msg) => {
        try {
            if (!msg || msg.isStatus || msg.broadcast || msg.isForwarded) return;
            
            // Processa o corpo da mensagem diretamente em tempo real
            if (msg.body) {
                processAndQueueLead(msg.id.id, msg.body);
            }
        } catch (e) {
            console.warn('⚠️ Aviso ao processar mensagem recebida:', e.message);
        }
    });

    newClient.on('disconnected', async (reason) => {
        console.log(`\n⚠️ WhatsApp desconectado. Motivo: ${reason}`);
        if (reason === 'LOGOUT') {
            limparSessaoEReiniciar();
        } else {
            handleReconnection();
        }
    });

    return newClient;
};

const handleReconnection = async () => {
    if (isReconnecting) return;
    isReconnecting = true;
    isConnected = false;
    connectionStatus = 'INITIALIZING';
    connectedNumber = null;
    qrCodeDataURL = null;

    if (client) {
        try { await client.destroy().catch(() => {}); } catch (e) {}
        client = null;
    }
    
    console.log('⏳ Aguardando liberação total de recursos do sistema antes de reiniciar (3 segundos)...');
    
    setTimeout(() => {
        console.log('🔄 Recriando cliente após desconexão...');
        client = createWhatsAppClient();
        client.initialize().then(() => {
            isReconnecting = false;
        }).catch((err) => {
            console.error('❌ Erro crítico ao inicializar o cliente:', err.message);
            if (err.message.includes('Execution context') || err.message.includes('Target closed') || err.message.includes('detached Frame') || err.message.includes('timeout') || err.message.includes('protocolTimeout')) {
                limparSessaoEReiniciar();
            } else {
                isReconnecting = false;
            }
        });
    }, 3000);
};

// ==========================================
// FUNÇÃO DE LIMPEZA PREVENTIVA NA INICIALIZAÇÃO
// ==========================================
const iniciarServidorLimpo = () => {
    console.log('🧹 Executando limpeza preventiva de inicialização do sistema...');
    
    // Força a exclusão das pastas para simular a desconexão logo ao abrir o app
    forceCleanSession();

    // Usando os processos identificados que o Puppeteer pode levantar
    exec('taskkill /F /IM msedgewebview2.exe /T', (err, stdout, stderr) => {
        console.log('🔫 Processos residuais (WebView2) encerrados. Inicializando WhatsApp...');
        
        // Inicialização Primária após a limpeza
        client = createWhatsAppClient();
        client.initialize().catch((err) => {
            console.error('❌ Falha na inicialização primária:', err.message);
            if (err.message.includes('Execution context') || err.message.includes('Target closed') || err.message.includes('timeout') || err.message.includes('protocolTimeout')) {
                limparSessaoEReiniciar();
            }
        });
    });
};

app.get('/status', (req, res) => {
    res.json({
        connected: isConnected,
        status: connectionStatus,
        qrCode: qrCodeDataURL,
        number: connectedNumber,
        percent: loadingPercent
    });
});

// Rotas de Auto-Leads
app.get('/auto-leads', (req, res) => res.json({ leads: global.autoLeadsQueue }));
app.post('/auto-leads/clear', (req, res) => {
    const { ids } = req.body;
    if (ids && Array.isArray(ids)) {
        global.autoLeadsQueue = global.autoLeadsQueue.filter(l => !ids.includes(l.id));
    }
    res.json({ success: true });
});

app.post('/disparar-unico', upload.single('file'), async (req, res) => {
    if (!isConnected) return res.status(400).json({ success: false, error: 'WhatsApp não conectado!' });
    const { phone, name, messageTemplate } = req.body;
    const file = req.file;
    let cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    
    console.log(`\n🚀 Nova requisição de disparo recebida para: ${name || 'Desconhecido'} (${phone})`);

    try {
        if (cleanPhone.length <= 11) cleanPhone = `55${cleanPhone}`;
        const chatId = `${cleanPhone}@c.us`;
        const contactId = await client.getNumberId(chatId);
        
        if (!contactId) {
            console.log(`❌ Disparo cancelado: O número ${cleanPhone} não é um WhatsApp válido.`);
            return res.json({ success: false, reason: 'Número inválido' });
        }

        const textToSend = messageTemplate ? messageTemplate.replace(/{nome}/gi, name ? name.split(' ')[0] : 'Cliente') : '';

        if (file) {
            console.log(`📎 Preparando arquivo de mídia para envio: ${file.originalname}`);
            const msgMedia = MessageMedia.fromFilePath(file.path);
            msgMedia.filename = file.originalname;
            await client.sendMessage(contactId._serialized, msgMedia, { caption: textToSend });
            console.log(`✅ Mídia enviada com sucesso para ${cleanPhone}`);
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } else if (textToSend) {
            await client.sendMessage(contactId._serialized, textToSend);
            console.log(`✅ Mensagem de texto enviada com sucesso para ${cleanPhone}`);
        }
        return res.json({ success: true });
    } catch (error) {
        if (file && file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        console.error(`❌ Erro no envio para ${cleanPhone}:`, error.message);
        if (error.message.includes('Execution context') || error.message.includes('detached Frame')) {
            limparSessaoEReiniciar();
        }
        return res.json({ success: false, reason: error.message });
    }
});

// Desconexão normal de troca de conta (Mantida exatamente como você aprova)
app.post('/desconectar', async (req, res) => {
    console.log('\n🛑 Solicitação de desconexão recebida via API.');
    if (!client || isReconnecting) return res.json({ success: true });
    try { await client.logout().catch(() => {}); } catch(e) {}
    limparSessaoEReiniciar();
    res.json({ success: true });
});

// ==========================================
// NOVA ROTA PARA ENCERRAMENTO TOTAL (FECHAR O APP)
// ==========================================
app.post('/encerrar-sistema', async (req, res) => {
    console.log('\n🛑 Solicitação de encerramento total recebida (App fechando).');
    
    // Responde rapidamente para não travar a UI de fechar o app
    res.json({ success: true });

    if (client) {
        try { await client.destroy().catch(() => {}); } catch(e) {}
        client = null;
    }

    forceCleanSession();

    exec('taskkill /F /IM msedgewebview2.exe /T', (err, stdout, stderr) => {
        console.log('🔫 Processos zumbis do WebView2 encerrados. Finalizando processo Node...');
        process.exit(0); // Força a saída e mata o server.js
    });
});

app.listen(3001, () => {
    console.log('🤖 Servidor rodando na porta 3001');
    iniciarServidorLimpo(); // Inicia o processo de limpeza antes de ligar o WWebJS
});