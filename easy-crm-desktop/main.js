const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fork, spawn } = require('child_process'); 
const serve = require('electron-serve'); // Versão 1.3.0 funciona perfeitamente aqui!
const fs = require('fs');
const os = require('os');
const https = require('https');

// Configura o servidor interno antes do app dar o sinal de "pronto"
const loadURL = serve({ directory: 'dist' });

let mainWindow;
let serverProcess = null;
let updaterWindow;
let remoteUpdateInfo = null;

// ==========================================
// CONFIGURAÇÃO DO SUPABASE (COLE A URL DO SEU LATEST.JSON AQUI)
// ==========================================
const UPDATE_JSON_URL = "https://omgkvkooitmdqulasdmx.supabase.co/storage/v1/object/public/app-updates/latest.json";

function startServer() {
    const serverPath = path.join(__dirname, 'server.js');
    serverProcess = fork(serverPath);

    serverProcess.on('message', (msg) => {
        console.log('Mensagem do Servidor:', msg);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1366,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        title: 'A11 CRM' // Título inicial
    });

    // Impede que a página web sobrescreva o título da janela do Electron (Força "A11 CRM")
    mainWindow.on('page-title-updated', (evt) => {
        evt.preventDefault();
    });
    mainWindow.setTitle("A11 CRM");

    // Carrega a interface gráfica do Expo de forma segura
    loadURL(mainWindow);
}

// ==========================================
// LÓGICA DE ATUALIZAÇÃO (UPDATER)
// ==========================================
async function checkForUpdates() {
    return new Promise((resolve) => {
        https.get(UPDATE_JSON_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const remoteData = JSON.parse(data);
                    const localVersion = app.getVersion();
                    
                    // Compara se a versão remota é diferente/maior
                    if (remoteData.version !== localVersion) {
                        remoteUpdateInfo = remoteData;
                        resolve(true); // Tem atualização
                    } else {
                        resolve(false); // Tá na última versão
                    }
                } catch (e) {
                    resolve(false); // Erro na leitura, deixa o app abrir normalmente
                }
            });
        }).on('error', () => resolve(false)); // Sem internet ou erro, ignora e abre normal
    });
}

function showUpdaterWindow() {
    updaterWindow = new BrowserWindow({
        width: 450,
        height: 350,
        resizable: false,
        frame: false, // Janela sem bordas
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // <--- Permite o uso do require no HTML do updater
        }
    });

    updaterWindow.loadFile('updater.html');

    updaterWindow.webContents.on('did-finish-load', () => {
        updaterWindow.webContents.send('update-info', remoteUpdateInfo);
    });
}

// Eventos que vêm do updater.html
ipcMain.on('cancel-update', () => {
    if (serverProcess) serverProcess.kill();
    app.quit(); // Se o usuário recusar a atualização, fecha tudo.
});

ipcMain.on('start-download', () => {
    const cleanFileName = remoteUpdateInfo.fileName.replace(/\s+/g, '_');
    const tempPath = path.join(os.tmpdir(), cleanFileName);
    
    console.log(`📥 [TESTE DE DOWNLOAD] Baixando de: ${remoteUpdateInfo.downloadUrl}`);
    console.log(`📂 Salvando em: ${tempPath}`);

    const downloadFile = (url) => {
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                console.log(`🔄 Redirecionado para: ${response.headers.location}`);
                return downloadFile(response.headers.location);
            }

            if (response.statusCode !== 200) {
                console.error(`❌ Erro no download: Status HTTP ${response.statusCode}`);
                if (updaterWindow) updaterWindow.webContents.send('status-text', `Erro HTTP: ${response.statusCode}`);
                return;
            }

            const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
            let downloadedBytes = 0;

            const file = fs.createWriteStream(tempPath);

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                let percent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
                
                if (totalBytes === 0) {
                    percent = Math.min((downloadedBytes / (50 * 1024 * 1024)) * 100, 99); 
                }

                if (updaterWindow) {
                    updaterWindow.webContents.send('download-progress', { percent });
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    console.log('✅ Download concluído fisicamente! Validando instalador...');
                    
                    const stats = fs.statSync(tempPath);
                    if (stats.size < 1024 * 1024) {
                        console.error('❌ O arquivo baixado é muito pequeno e parece corrompido.');
                        if (updaterWindow) updaterWindow.webContents.send('status-text', 'Erro: Arquivo corrompido.');
                        return;
                    }

                    console.log('🚀 Disparando instalador em segundo plano...');
                    try {
                        if (serverProcess) serverProcess.kill();

                        // Usa o explorador do Windows para abrir o instalador de forma totalmente autônoma e segura
                        const subprocess = spawn('cmd.exe', ['/c', 'start', '', tempPath], {
                            detached: true,
                            stdio: 'ignore',
                            windowsVerbatimArguments: true
                        });
                        
                        subprocess.unref(); 

                        // Aguarda 1.5 segundos para garantir que o processo do instalador abriu no Windows antes de fechar o app
                        setTimeout(() => {
                            app.quit();
                        }, 1500);

                    } catch (err) {
                        console.error("❌ Erro fatal ao iniciar o instalador:", err.message);
                    }
                });
            });
        }).on('error', (err) => {
            console.error("❌ Erro na requisição HTTPS:", err.message);
            fs.unlink(tempPath, () => {});
            if (updaterWindow) updaterWindow.webContents.send('status-text', 'Erro no download.');
        });
    };

    downloadFile(remoteUpdateInfo.downloadUrl);
});

// ==========================================
// INICIALIZAÇÃO DO APP
// ==========================================
app.whenReady().then(async () => {
    // 1. Checa a versão no Supabase antes de tudo
    const hasUpdate = await checkForUpdates();

    if (hasUpdate) {
        // 2a. Tem atualização: Bloqueia o sistema e mostra a tela
        showUpdaterWindow();
    } else {
        // 2b. Tudo atualizado: Liga o robô e abre a janela normalmente
        startServer();
        createWindow();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0 && !hasUpdate) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});