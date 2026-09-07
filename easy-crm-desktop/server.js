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
let initWatchdog = null; 

let availableBrowsers = [];
let currentBrowserIndex = 0;

const AUTH_DIR = path.join(os.homedir(), '.conectorzap_auth');

global.autoLeadsQueue = [];

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

const forceCleanSession = () => {
    try {
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log('🗑️ Sessão local apagada com sucesso (Desconectado).');
        }
    } catch (e) {
        console.warn('⚠️ Falha ao remover pastas nativamente. Tentando força bruta...', e.message);
        try {
            if (os.platform() === 'win32') {
                exec(`rmdir /s /q "${AUTH_DIR}"`);
            }
        } catch(err) {}
    }
};

const matarZumbisDoConector = (callback) => {
    if (os.platform() === 'win32') {
        const cmdEdge = `wmic process where "name='msedge.exe' and commandline like '%conectorzap_auth%'" call terminate`;
        const cmdChrome = `wmic process where "name='chrome.exe' and commandline like '%conectorzap_auth%'" call terminate`;
        const cmdBrave = `wmic process where "name='brave.exe' and commandline like '%conectorzap_auth%'" call terminate`;
        
        exec(cmdEdge, () => {
            exec(cmdChrome, () => {
                exec(cmdBrave, () => {
                    setTimeout(() => { if (callback) callback(); }, 1500);
                });
            });
        });
    } else {
        if (callback) callback();
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

    matarZumbisDoConector(() => {
        console.log('🔫 Processos fantasmas eliminados. Reiniciando cliente em 3 segundos...');
        setTimeout(() => {
            isReconnecting = false;
            handleReconnection();
        }, 3000);
    });
};

process.on('uncaughtException', (err) => {
    console.error('🔥 Erro Crítico Não Tratado no Sistema:', err.message);
    if (err.message.includes('Execution context') || err.message.includes('detached Frame') || err.message.includes('Target closed') || err.message.includes('timeout') || err.message.includes('protocolTimeout')) {
        limparSessaoEReiniciar();
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('🔥 Rejeição de Promessa Não Tratada:', reason?.message || reason);
    if (reason?.message?.includes('Execution context') || reason?.message?.includes('detached Frame') || reason?.message?.includes('Target closed') || reason?.message?.includes('timeout') || reason?.message?.includes('protocolTimeout')) {
        limparSessaoEReiniciar();
    }
});

const getAvailableBrowsers = () => {
    const platform = os.platform();
    const foundPaths = [];

    if (platform === 'win32') {
        const paths = [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ];

        for (const p of paths) {
            if (fs.existsSync(p)) foundPaths.push(p);
        }
    } else if (platform === 'darwin') { 
        const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        if (fs.existsSync(macPath)) foundPaths.push(macPath);
    }

    if (foundPaths.length === 0) {
        console.error("❌ [ERRO CRÍTICO] Nenhum navegador compatível foi encontrado nesta máquina!");
    }

    return foundPaths;
};

const createWhatsAppClient = () => {
    console.log('\n🔄 Inicializando cliente do WhatsApp...');
    connectionStatus = 'INITIALIZING';

    if (availableBrowsers.length === 0) {
        availableBrowsers = getAvailableBrowsers();
    }

    if (initWatchdog) clearTimeout(initWatchdog);
    initWatchdog = setTimeout(() => {
        if (connectionStatus === 'INITIALIZING') {
            console.error('⏳ [WATCHDOG] Demora excessiva na inicialização. Forçando Auto-Recovery...');
            limparSessaoEReiniciar();
        }
    }, 45000); 

    const executablePath = availableBrowsers[currentBrowserIndex];
    console.log(`✅ [Tentativa ${currentBrowserIndex + 1}/${availableBrowsers.length}] Usando Navegador: ${executablePath}`);

    const newClient = new Client({
        authStrategy: new LocalAuth({ 
            dataPath: AUTH_DIR,
            clientId: 'vendedor' 
        }),
        puppeteer: {
            headless: true,
            executablePath: executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-features=RendererCodeIntegrity',
                '--disable-background-networking'
            ]
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1010703399-alpha.html',
        }
    });

    newClient.on('qr', (qr) => {
        if (isConnected) return;
        if (initWatchdog) clearTimeout(initWatchdog);
        isConnected = false;
        connectedNumber = null;
        connectionStatus = 'QR_CODE';
        console.log('📱 QR Code gerado! Aguardando leitura pelo aplicativo do celular...');
        qrcode.toDataURL(qr, (err, url) => { qrCodeDataURL = url; });
    });

    newClient.on('authenticated', () => {
        if (isConnected) return;
        if (initWatchdog) clearTimeout(initWatchdog);
        if (connectionStatus !== 'AUTHENTICATING') {
            console.log('✅ QR Code lido! Autenticando no WhatsApp...');
        }
        connectionStatus = 'AUTHENTICATING';
        qrCodeDataURL = null;
    });

    newClient.on('loading_screen', (percent, message) => {
        if (isConnected) return;
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

    newClient.on('message', async (msg) => {
        try {
            if (!msg || msg.isStatus || msg.broadcast || msg.isForwarded) return;
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
            forceCleanSession(); 
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
            
            if (currentBrowserIndex < availableBrowsers.length - 1) {
                currentBrowserIndex++;
                console.log('🔄 Trocando para o próximo navegador da lista...');
                if (client) {
                    try { client.destroy().catch(() => {}); } catch(e) {}
                    client = null;
                }
                setTimeout(handleReconnection, 2000);
            } else {
                console.error('❌ Todos os navegadores falharam na reconexão.');
                currentBrowserIndex = 0;
                if (err.message.includes('Execution context') || err.message.includes('Target closed') || err.message.includes('timeout')) {
                    limparSessaoEReiniciar();
                } else {
                    isReconnecting = false;
                }
            }
        });
    }, 3000);
};

const iniciarServidorLimpo = () => {
    console.log('🧹 Executando verificação inicial de processos...');
    
    matarZumbisDoConector(() => {
        forceCleanSession(); 

        console.log('🔫 Ambiente seguro. Inicializando WhatsApp...');
        
        client = createWhatsAppClient();
        client.initialize().catch((err) => {
            console.error('❌ Falha na inicialização primária:', err.message);
            
            if (currentBrowserIndex < availableBrowsers.length - 1) {
                currentBrowserIndex++;
                console.log('🔄 Trocando para o próximo navegador da lista...');
                if (client) {
                    try { client.destroy().catch(() => {}); } catch(e) {}
                    client = null;
                }
                setTimeout(iniciarServidorLimpo, 2000);
            } else {
                console.error('❌ Todos os navegadores disponíveis falharam.');
                currentBrowserIndex = 0;
                if (err.message.includes('Execution context') || err.message.includes('Target closed') || err.message.includes('timeout')) {
                    limparSessaoEReiniciar();
                }
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

app.post('/desconectar', async (req, res) => {
    console.log('\n🛑 Solicitação de desconexão recebida via API.');
    if (!client || isReconnecting) return res.json({ success: true });
    try { await client.logout().catch(() => {}); } catch(e) {}
    forceCleanSession();
    limparSessaoEReiniciar();
    res.json({ success: true });
});

app.post('/encerrar-sistema', async (req, res) => {
    console.log('\n🛑 Solicitação de encerramento total recebida (App fechando/Desconectar).');
    
    res.json({ success: true });

    if (client) {
        try { await client.logout(); } catch(e) {}
        try { await client.destroy(); } catch(e) {}
        client = null;
    }

    matarZumbisDoConector(() => {
        forceCleanSession(); 
        console.log('🔫 Processos zumbis encerrados e sessão limpa. Finalizando processo Node...');
        process.exit(0); 
    });
});

app.listen(3001, () => {
    console.log('🤖 Servidor rodando na porta 3001');
    iniciarServidorLimpo();
});