require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

// Configurações
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET_NAME = 'app-updates';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

async function deploy() {
    console.log('🚀 Iniciando processo de Deploy Híbrido do A11 CRM...');

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
        console.error('❌ Erro: Faltam as variáveis do GitHub no arquivo .env');
        process.exit(1);
    }

    // 1. Atualizar versão no package.json
    const packagePath = path.join(__dirname, '../package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const oldVersion = packageData.version;
    const newVersion = semver.inc(oldVersion, 'patch');
    packageData.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
    console.log(`📦 Versão atualizada: ${oldVersion} -> ${newVersion}`);

    // 2. Gerar a Build
    console.log('⚙️ Compilando a nova versão... (Isso pode demorar alguns minutos)');
    execSync('npm run build', { stdio: 'inherit' });

    // 3. Encontrar o arquivo .exe
    const releaseDir = path.join(__dirname, '../release');
    const files = fs.readdirSync(releaseDir);
    const exeFile = files.find(f => f.endsWith('.exe') && f.includes(newVersion) && !f.includes('blockmap'));
    
    if (!exeFile) {
        console.error(`❌ Erro: Arquivo .exe da versão ${newVersion} não encontrado!`);
        packageData.version = oldVersion;
        fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
        process.exit(1);
    }
    
    const exePath = path.join(releaseDir, exeFile);
    const exeStats = fs.statSync(exePath);
    const safeExeName = exeFile.replace(/\s+/g, '_');

    console.log(`\n🐙 Criando Release v${newVersion} no GitHub...`);
    
    // 4. Criar Release no GitHub
    const releaseRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            tag_name: `v${newVersion}`,
            name: `A11 CRM - Versão ${newVersion}`,
            body: `Atualização automática obrigatória para a versão ${newVersion}.`,
            draft: false,
            prerelease: false
        })
    });

    if (!releaseRes.ok) {
        const err = await releaseRes.text();
        console.error('❌ Erro ao criar Release no GitHub:', err);
        packageData.version = oldVersion;
        fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
        process.exit(1);
    }

    const releaseData = await releaseRes.json();
    const uploadUrl = releaseData.upload_url.split('{')[0] + `?name=${safeExeName}`;

    // 5. Upload do .exe para o GitHub
    console.log(`📤 Fazendo upload do arquivo (${(exeStats.size / 1024 / 1024).toFixed(2)} MB) para o GitHub...`);
    const fileBuffer = fs.readFileSync(exePath);
    
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/octet-stream',
            'Content-Length': exeStats.size.toString()
        },
        body: fileBuffer
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        console.error('❌ Erro no upload para o GitHub:', err);
        process.exit(1);
    }

    const uploadData = await uploadRes.json();
    const finalDownloadUrl = uploadData.browser_download_url;
    console.log(`✅ Arquivo hospedado com sucesso: ${finalDownloadUrl}`);

    // 6. Atualizar o latest.json no Supabase (Esse é super leve e não esbarra no limite)
    console.log('\n📝 Atualizando o controle de versão no Supabase...');
    
    const latestConfig = {
        version: newVersion,
        fileName: safeExeName,
        downloadUrl: finalDownloadUrl, // <--- Aponta direto pro GitHub
        sizeBytes: exeStats.size,
        releaseDate: new Date().toISOString()
    };

    const { error: jsonError } = await supabase.storage.from(BUCKET_NAME).upload('latest.json', JSON.stringify(latestConfig, null, 2), {
        contentType: 'application/json',
        upsert: true
    });

    if (jsonError) {
        console.error('❌ Erro ao atualizar o Supabase:', jsonError.message);
        process.exit(1);
    }

    console.log(`\n🎉 DEPLOY HÍBRIDO CONCLUÍDO!`);
    console.log(`👉 A versão v${newVersion} já está ativa e será baixada automaticamente pelos clientes.`);
}

deploy().catch(console.error);