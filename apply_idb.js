const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(targetPath, 'utf8');

// 1. Add DB object
const dbCode = `
// ══════════════════════════════════════════════════════════════
// DB — IndexedDB wrapper para Swap (Evitar Out of Memory)
// ══════════════════════════════════════════════════════════════
const DB = {
    db: null,
    async init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('EduVault_Swap', 1);
            req.onupgradeneeded = e => {
                e.target.result.createObjectStore('swap');
            };
            req.onsuccess = e => {
                this.db = e.target.result;
                resolve();
            };
            req.onerror = e => reject(e);
        });
    },
    async put(key, blob) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('swap', 'readwrite');
            tx.objectStore('swap').put(blob, key);
            tx.oncomplete = () => resolve();
            tx.onerror = e => reject(e);
        });
    },
    async get(key) {
        return new Promise((resolve, reject) => {
            const req = this.db.transaction('swap').objectStore('swap').get(key);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e);
        });
    },
    async clear() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('swap', 'readwrite');
            tx.objectStore('swap').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = e => reject(e);
        });
    }
};
`;

// Insert the DB object right after Storage object
html = html.replace(/const UI = \{/, dbCode + '\nconst UI = {');

// 2. Add DB.init() to App.init()
html = html.replace(/DOM\.init\(\);\s*State\.userCategories = Storage\.load\(\);/s, `DOM.init();\n        State.userCategories = Storage.load();\n        DB.init(); // Initialize swap space`);

// 3. Rewrite ZIP.generate() 
const oldGenerateMatch = html.match(/async generate\(\) \{[\s\S]*?\} catch \(e\) \{[\s\S]*?UI\.showSection\(DOM\.sectionResults\), 2000\);\s*\}\s*\}/);

const newGenerateCode = `async generate() {
        const names = Object.keys(State.studentsData);
        if (!names.length) {
            UI.toast('Nenhum dado carregado. Selecione uma pasta primeiro.', 'error');
            return;
        }

        UI.showSection(DOM.sectionProcessing);
        DOM.progressContainer.classList.remove('hidden-section');
        DOM.fileProgressContainer.classList.remove('hidden-section');
        DOM.progressBar.style.width    = '0%';
        DOM.progressLabel.textContent  = '0%';
        DOM.fileProgressBar.style.width = '0%';
        DOM.fileProgressText.textContent = '';
        DOM.statusSub.textContent = 'Preparando o lote...';

        try {
            await DB.clear(); // Ensure clean swap space
            const generatedZipNames = [];
            
            const t0 = Date.now();
            let splitCount = 0;

            const totalAllFiles = Object.values(State.studentsData).reduce((s, f) => s + f.length, 0);
            let filesProcessed = 0;

            for (let i = 0; i < names.length; i++) {
                const name   = names[i];
                const sFiles = State.studentsData[name];
                const totalStudentSize = sFiles.reduce((sum, item) => sum + item.file.size, 0);

                // — Etapa 1: Compressão condicional de PDFs —
                if (totalStudentSize > Config.SAFE_RAW_LIMIT) {
                    DOM.statusText.textContent = \`A otimizar PDFs de: \${name}\`;

                    for (const item of sFiles) {
                        if (!item.originalName.toLowerCase().endsWith('.pdf')) continue;
                        if (item.file.size <= Config.PDF_COMPRESS_THRESHOLD) continue;

                        const beforeMB = (item.file.size / 1024 / 1024).toFixed(1);
                        DOM.fileProgressContainer.classList.remove('hidden-section');

                        try {
                            const pdfBytes      = new Uint8Array(await item.file.arrayBuffer());
                            const compressed    = await PDF.compress(pdfBytes, msg => {
                                DOM.fileProgressText.textContent = msg;
                            });
                            const compressedBlob = new Blob([compressed], { type: 'application/pdf' });
                            const afterMB = (compressedBlob.size / 1024 / 1024).toFixed(1);

                            if (compressedBlob.size < item.file.size) {
                                console.info(\`PDF otimizado: \${beforeMB}MB → \${afterMB}MB\`);
                                item.file = compressedBlob;
                            }
                        } catch (err) {
                            console.error('Erro ao comprimir PDF:', item.originalName, err);
                        }
                    }
                }

                // — Etapa 2: Geração dos ZIPs por categoria —
                DOM.statusText.textContent = \`A compactar para Disco Virtual: \${name}\`;
                DOM.statusSub.textContent  = \`Aluno \${i + 1} de \${names.length} · \${sFiles.length} ficheiro(s)\`;

                const studentZips = ZIP.buildCategoryOrdered(name, sFiles);
                if (studentZips.length > 1) splitCount++;

                let zipIdx = 0;
                for (const { zipName, zip } of studentZips) {
                    zipIdx++;
                    const partLabel = studentZips.length > 1 ? \` (parte \${zipIdx}/\${studentZips.length})\` : '';
                    DOM.fileProgressText.textContent = \`A gerar \${zipName}\${partLabel}...\`;
                    DOM.fileProgressBar.style.width  = '0%';

                    const blob = await zip.generateAsync(
                        { type: 'blob', compression: 'STORE' },
                        meta => {
                            DOM.fileProgressBar.style.width = \`\${Math.round(meta.percent)}%\`;
                            if (meta.currentFile) DOM.fileProgressText.textContent = meta.currentFile;
                        }
                    );
                    
                    // Salvar no IndexedDB e registar o nome
                    await DB.put(zipName, blob);
                    generatedZipNames.push(zipName);
                }

                filesProcessed += sFiles.length;
                const pct = Math.round((filesProcessed / totalAllFiles) * 100);
                DOM.progressBar.style.width   = \`\${pct}%\`;
                DOM.progressLabel.textContent = \`\${pct}%\`;
                
                // Liberta a memória RAM dos ficheiros originais deste aluno para evitar OOM
                for (const item of sFiles) {
                    item.file = null; 
                }
            }

            // — Etapa 3: ZIP mestre —
            DOM.statusText.textContent       = 'A montar lote Mestre...';
            DOM.statusSub.textContent        = 'Recuperando dados do Disco Virtual (IndexedDB)';
            DOM.fileProgressText.textContent = 'A preparar estrutura...';
            DOM.fileProgressBar.style.width  = '0%';

            const masterZip = new JSZip();

            for (let i = 0; i < generatedZipNames.length; i++) {
                const zName = generatedZipNames[i];
                DOM.fileProgressText.textContent = \`A indexar \${zName}...\`;
                DOM.fileProgressBar.style.width = \`\${Math.round((i / generatedZipNames.length) * 100)}%\`;
                
                // Ler Blob do disco virtual
                const blob = await DB.get(zName);
                masterZip.file(zName, blob);
            }

            DOM.statusText.textContent       = 'A criar arquivo de download...';
            DOM.statusSub.textContent        = 'Pode demorar uns segundos';
            DOM.fileProgressText.textContent = 'A gerar Lote.zip...';
            DOM.fileProgressBar.style.width  = '0%';

            const master = await masterZip.generateAsync(
                { type: 'blob', compression: 'STORE' },
                meta => { DOM.fileProgressBar.style.width = \`\${Math.round(meta.percent)}%\`; }
            );

            DOM.fileProgressContainer.classList.add('hidden-section');

            const blobUrl = URL.createObjectURL(master);
            const link = document.createElement('a');
            link.href     = blobUrl;
            link.download = \`Lote_Alunos_\${new Date().toISOString().slice(0, 10)}.zip\`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

            // APAGAR O DISCO VIRTUAL PARA LIMPAR O ESPAÇO
            await DB.clear();

            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            UI.toast(\`Download concluído em \${elapsed}s — \${generatedZipNames.length} ZIPs gerados!\`, 'success', 6000);
            if (splitCount > 0) {
                setTimeout(() => UI.toast(
                    \`\${splitCount} aluno(s) excediam 13MB e foram divididos em múltiplos ZIPs.\`, 'info', 8000
                ), 1000);
            }

            setTimeout(() => UI.showSection(DOM.sectionResults), 1500);

        } catch (e) {
            console.error(e);
            UI.toast('Ocorreu um erro ao gerar os ficheiros. Tente novamente.', 'error');
            DOM.fileProgressContainer.classList.add('hidden-section');
            setTimeout(() => UI.showSection(DOM.sectionResults), 2000);
        }
    }`;

if (oldGenerateMatch) {
    html = html.replace(oldGenerateMatch[0], newGenerateCode);
    fs.writeFileSync(targetPath, html);
    console.log("IndexedDB swap implemented successfully.");
} else {
    console.log("Regex for ZIP.generate() failed.");
}
