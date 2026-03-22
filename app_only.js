    },

    /** Alterna expansão de um item da lista de alunos */
    _toggleStudent(id) {
        const body = document.getElementById(`${id}-body`);
        const chev = document.getElementById(`${id}-chev`);
        const btn  = body?.previousElementSibling;
        const open = !body.classList.contains('hidden');
        body.classList.toggle('hidden', open);
        chev?.classList.toggle('rotate-180', !open);
        btn?.setAttribute('aria-expanded', String(!open));
    },
};

// ══════════════════════════════════════════════════════════════
// FILES — Leitura e processamento de ficheiros do sistema
// ══════════════════════════════════════════════════════════════
const Files = {
    /**
     * Processa um array de File objects e preenche State.studentsData.
     * A estrutura esperada é: PastaMestre/NomeAluno/arquivo.pdf
     */
    process(files) {
        State.studentsData = {};
        let totalFiles = 0;

        for (const file of files) {
            const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
            const parts = rel.split('/').filter(Boolean);
            if (parts.length < 3) continue; // Ignora ficheiros não dentro de subpastas de aluno

            const studentName = parts[1];
            const originalName = parts[parts.length - 1];

            if (Config.IGNORED_FILES.has(originalName.toLowerCase())) continue;
            if (originalName.startsWith('.')) continue;

            const catName = Categories.categorize(originalName);

            if (!State.studentsData[studentName]) State.studentsData[studentName] = [];
            State.studentsData[studentName].push({ file, catName, originalName });
            totalFiles++;
        }

        return {
            totalStudents: Object.keys(State.studentsData).length,
            totalFiles,
        };
    },

    /**
     * Lê recursivamente um FileSystemDirectoryHandle (Drag & Drop API).
     * Recria o webkitRelativePath manualmente para compatibilidade com process().
     */
    async readDirRecursive(dirHandle, basePath = '') {
        const result = [];
        for await (const entry of dirHandle.values()) {
            const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                Object.defineProperty(file, 'webkitRelativePath', { value: entryPath, writable: false });
                result.push(file);
            } else if (entry.kind === 'directory') {
                result.push(...await this.readDirRecursive(entry, entryPath));
            }
        }
        return result;
    },
};

// ══════════════════════════════════════════════════════════════
// PDF — Compressão de PDFs grandes (via pdf.js + jsPDF)
// ══════════════════════════════════════════════════════════════
const PDF = {
    /**
     * Comprime um PDF renderizando cada página em canvas e re-exportando como JPEG.
     * @param {Uint8Array} pdfBytes      Bytes do PDF original
     * @param {Function}  onProgress     Callback (message: string) para atualizar a UI
     * @returns {Promise<Uint8Array>}    Bytes do PDF comprimido
     */
    async compress(pdfBytes, onProgress) {
        const { jsPDF } = window.jspdf;
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        const doc = new jsPDF({ compress: true });
        doc.deletePage(1);

        for (let i = 1; i <= pdf.numPages; i++) {
            onProgress(`Comprimindo PDF — página ${i} de ${pdf.numPages}...`);
            const page     = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas   = document.createElement('canvas');
            canvas.width   = viewport.width;
            canvas.height  = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const orientation = viewport.width > viewport.height ? 'l' : 'p';
            doc.addPage([viewport.width, viewport.height], orientation);
            doc.addImage(canvas.toDataURL('image/jpeg', 0.6), 'JPEG', 0, 0, viewport.width, viewport.height);
        }

        return new Uint8Array(doc.output('arraybuffer'));
    },
};

// ══════════════════════════════════════════════════════════════
// ZIP — Geração e empacotamento dos ficheiros
// ══════════════════════════════════════════════════════════════
const ZIP = {
    /**
     * Constrói os ZIPs de um aluno organizados por categoria.
     * Divide em partes se ultrapassar SAFE_RAW_LIMIT.
     * @returns {{ zipName: string, zip: JSZip }[]}
     */
    buildCategoryOrdered(studentName, studentFiles) {
        const filesByCategory = new Map();
        for (const cat of State.userCategories) {
            const catFiles = studentFiles.filter(f => f.catName === cat.name);
            if (catFiles.length > 0) filesByCategory.set(cat.name, catFiles);
        }
        // Orphans: ficheiros em categorias que já não existem
        const knownNames = new Set(State.userCategories.map(c => c.name));
        const orphans = studentFiles.filter(f => !knownNames.has(f.catName));
        if (orphans.length > 0) {
            const fbName = (State.userCategories.find(c => c.isFallback) || { name: 'PDF Não encontrado' }).name;
            filesByCategory.set(fbName, [...(filesByCategory.get(fbName) || []), ...orphans]);
        }

        const result = [];
        let currentZip  = new JSZip();
        let currentSize = 0;
        let partNumber  = 1;

        for (const [catName, catFiles] of filesByCategory) {
            let catPart       = 1;
            let catFolderName = catName;

            for (const item of catFiles) {
                const fSize = item.file.size;
                if (currentSize > 0 && (currentSize + fSize) > Config.SAFE_RAW_LIMIT) {
                    result.push({
                        zipName: partNumber === 1 ? `${studentName}.zip` : `${studentName}_parte${partNumber}.zip`,
                        zip: currentZip,
                    });
                    currentZip  = new JSZip();
                    currentSize = 0;
                    partNumber++;
                    catPart++;
                    catFolderName = `${catName}_parte${catPart}`;
                }
                currentZip.folder(catFolderName).file(item.originalName, item.file);
                currentSize += fSize;
            }
        }

        if (currentSize > 0 || result.length === 0) {
            result.push({
                zipName: partNumber === 1 ? `${studentName}.zip` : `${studentName}_parte${partNumber}.zip`,
                zip: currentZip,
            });
        }

        return result;
    },

    /**
     * Ponto de entrada principal: comprime PDFs quando necessário,
     * gera os ZIPs de cada aluno e empacota tudo num ZIP mestre.
     */
    async generate() {
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
            const masterZip = new JSZip();
            const t0 = Date.now();
            let totalZips = 0;
            let splitCount = 0;

            const totalAllFiles = Object.values(State.studentsData).reduce((s, f) => s + f.length, 0);
            let filesProcessed = 0;

            for (let i = 0; i < names.length; i++) {
                const name   = names[i];
                const sFiles = State.studentsData[name];
                const totalStudentSize = sFiles.reduce((sum, item) => sum + item.file.size, 0);

                // — Etapa 1: Compressão condicional de PDFs —
                if (totalStudentSize > Config.SAFE_RAW_LIMIT) {
                    DOM.statusText.textContent = `A otimizar PDFs de: ${name}`;

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
                                console.info(`PDF otimizado: ${beforeMB}MB → ${afterMB}MB`);
                                item.file = compressedBlob;
                            } else {
                                console.warn(`Compressão não reduziu "${item.originalName}" (${beforeMB}→${afterMB}MB). Mantendo original.`);
                            }
                        } catch (err) {
                            console.error('Erro ao comprimir PDF:', item.originalName, err);
                            UI.toast(`Não foi possível comprimir "${item.originalName}". Será incluído no original.`, 'info', 6000);
                        }
                    }
                }

                // — Etapa 2: Geração dos ZIPs por categoria —
                DOM.statusText.textContent = `A compactar: ${name}`;
                DOM.statusSub.textContent  = `Aluno ${i + 1} de ${names.length} · ${sFiles.length} ficheiro(s)`;

                const studentZips = ZIP.buildCategoryOrdered(name, sFiles);
                if (studentZips.length > 1) splitCount++;

                let zipIdx = 0;
                for (const { zipName, zip } of studentZips) {
                    zipIdx++;
                    const partLabel = studentZips.length > 1 ? ` (parte ${zipIdx}/${studentZips.length})` : '';
                    DOM.fileProgressText.textContent = `Compactando ${zipName}${partLabel}...`;
                    DOM.fileProgressBar.style.width  = '0%';

                    const blob = await zip.generateAsync(
                        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
                        meta => {
                            DOM.fileProgressBar.style.width = `${Math.round(meta.percent)}%`;
                            if (meta.currentFile) DOM.fileProgressText.textContent = meta.currentFile;
                        }
                    );
                    masterZip.file(zipName, blob);
                    totalZips++;
                }

                filesProcessed += sFiles.length;
                const pct = Math.round((filesProcessed / totalAllFiles) * 100);
                DOM.progressBar.style.width   = `${pct}%`;
                DOM.progressLabel.textContent = `${pct}%`;
            }

            // — Etapa 3: ZIP mestre —
            DOM.statusText.textContent       = 'A finalizar arquivo mestre...';
            DOM.statusSub.textContent        = 'Quase lá!';
            DOM.fileProgressText.textContent = 'Empacotando tudo...';
            DOM.fileProgressBar.style.width  = '0%';

            const master = await masterZip.generateAsync(
                { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } },
                meta => { DOM.fileProgressBar.style.width = `${Math.round(meta.percent)}%`; }
            );

            DOM.fileProgressContainer.classList.add('hidden-section');

            const blobUrl = URL.createObjectURL(master);
            const link = document.createElement('a');
            link.href     = blobUrl;
            link.download = `Lote_Alunos_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            UI.toast(`Download concluído em ${elapsed}s — ${totalZips} ZIPs gerados!`, 'success', 6000);
            if (splitCount > 0) {
                setTimeout(() => UI.toast(
                    `${splitCount} aluno(s) excediam 15MB e foram divididos em múltiplos ZIPs.`, 'info', 8000
                ), 1000);
            }

            setTimeout(() => UI.showSection(DOM.sectionResults), 1500);

        } catch (e) {
            console.error(e);
            UI.toast('Ocorreu um erro ao gerar os ficheiros. Tente novamente.', 'error');
            DOM.fileProgressContainer.classList.add('hidden-section');
            setTimeout(() => UI.showSection(DOM.sectionResults), 2000);
        }
    },
};

// ══════════════════════════════════════════════════════════════
// REPORT — Geração do relatório HTML por aluno
// ══════════════════════════════════════════════════════════════
const Report = {
    /** Gera e faz download de um relatório HTML detalhado do lote */
    generate() {
        if (!Object.keys(State.studentsData).length) {
            UI.toast('Nenhum dado para gerar relatório.', 'error');
            return;
        }
        const now = new Date().toLocaleString('pt-PT');
        const rows = Object.entries(State.studentsData).map(([name, files]) => {
            const cats = {};
            for (const f of files) cats[f.catName] = (cats[f.catName] || 0) + 1;
            const catBadges = Object.entries(cats).map(([c, n]) => {
                const col = Categories.getColor(c);
                return `<span style="background:${col.bg};color:${col.text};padding:2px 8px;border-radius:99px;font-size:11px;margin:2px;display:inline-block">${Utils.esc(c)} <b>${n}</b></span>`;
            }).join('');
            return `<tr><td style="padding:10px;border-bottom:1px solid #f1f5f9;font-weight:600">${Utils.esc(name)}</td>
                <td style="padding:10px;border-bottom:1px solid #f1f5f9;text-align:center">${files.length}</td>
                <td style="padding:10px;border-bottom:1px solid #f1f5f9">${catBadges}</td></tr>`;
        }).join('');

        const totalStudents = Object.keys(State.studentsData).length;
        const totalFiles    = Object.values(State.studentsData).reduce((s, f) => s + f.length, 0);

        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório do Lote — ${now}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e293b;max-width:900px;margin:auto}
h1{font-size:22px;margin-bottom:4px}p{color:#64748b;margin-bottom:24px;font-size:13px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:10px;background:#f8fafc;font-size:12px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0}
.summary{display:flex;gap:20px;margin-bottom:24px}.card{background:#f8fafc;border-radius:12px;padding:16px 24px;flex:1}
.card b{font-size:26px;display:block}.card span{font-size:12px;color:#94a3b8}</style></head>
<body>
<h1>📦 Relatório do Lote de Alunos</h1>
<p>Gerado em: ${now} &nbsp;·&nbsp; Por: Carlos Antonio de Oliveira Piquet</p>
<div class="summary">
    <div class="card"><b>${totalStudents}</b><span>Alunos</span></div>
    <div class="card"><b>${totalFiles}</b><span>Ficheiros</span></div>
</div>
<table><thead><tr><th>Aluno</th><th>Ficheiros</th><th>Categorias</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;

        const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        const a = document.createElement('a');
        a.href     = blobUrl;
        a.download = `Relatorio_Lote_${new Date().toISOString().slice(0, 10)}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    },
};

// ══════════════════════════════════════════════════════════════
// APP — Inicialização e registro centralizado de eventos
// ══════════════════════════════════════════════════════════════
const App = {
    /** Ponto de entrada: chamado após DOMContentLoaded */
    init() {
        DOM.init();
        State.userCategories = Storage.load();
        this._registerEvents();
        lucide.createIcons();
    },

    /** Registra todos os event listeners da aplicação */
    _registerEvents() {
        // Zona de upload — clique
        DOM.dropZone.addEventListener('click', () => DOM.fileInput.click());

        // Zona de upload — drag & drop
        DOM.dropZone.addEventListener('dragover', e  => { e.preventDefault(); DOM.dropZone.classList.add('drag-over'); });
        ['dragleave', 'dragend'].forEach(ev =>
            DOM.dropZone.addEventListener(ev, () => DOM.dropZone.classList.remove('drag-over'))
        );
        DOM.dropZone.addEventListener('drop', e => this._handleDrop(e));

        // Input de ficheiros (seleção manual)
        DOM.fileInput.addEventListener('change', e => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            UI.showSection(DOM.sectionProcessing);
            DOM.statusText.textContent = 'A ler ficheiros da pasta...';
            DOM.statusSub.textContent  = 'Identificando alunos e documentos';
            DOM.progressContainer.classList.add('hidden-section');
            setTimeout(() => {
                try {
                    const { totalStudents, totalFiles } = Files.process(files);
                    if (!totalStudents) {
                        UI.toast('Nenhuma pasta de aluno foi encontrada. Verifique a estrutura de pastas.', 'error');
                        UI.showSection(DOM.sectionUpload);
                        return;
                    }
                    UI.buildResultsUI(totalStudents, totalFiles);
                    UI.showSection(DOM.sectionResults);
                    UI.toast(`${totalStudents} alunos carregados com sucesso!`, 'success');
                } catch (err) {
                    console.error(err);
                    UI.toast('Erro ao ler os ficheiros. Tente novamente.', 'error');
                    UI.showSection(DOM.sectionUpload);
                } finally {
                    DOM.fileInput.value = '';
                }
            }, 120);
        });

        // Botões principais
        DOM.btnGenerate.addEventListener('click', () => Categories.openModal());
        DOM.btnReport.addEventListener('click',   () => Report.generate());
        DOM.btnRestart.addEventListener('click',  () => {
            State.studentsData = {};
            DOM.fileInput.value = '';
            UI.showSection(DOM.sectionUpload);
        });

        // Busca e ordenação
        DOM.searchInput.addEventListener('input',  () => UI.applyFiltersAndSort());
        DOM.sortSelect.addEventListener('change',  () => UI.applyFiltersAndSort());
    },

    /** Trata o evento de drop de pasta na zona de upload */
    async _handleDrop(e) {
        e.preventDefault();
        DOM.dropZone.classList.remove('drag-over');
        const items = [...(e.dataTransfer.items || [])];
        const first = items[0];

        if (first && typeof first.getAsFileSystemHandle === 'function') {
            try {
                const handle = await first.getAsFileSystemHandle();
                if (handle.kind !== 'directory') {
                    UI.toast('Por favor arraste uma pasta, não um arquivo individual.', 'info');
                    return;
                }
                UI.showSection(DOM.sectionProcessing);
                DOM.statusText.textContent = 'A ler ficheiros da pasta...';
                DOM.statusSub.textContent  = 'Percorrendo subpastas...';
                DOM.progressContainer.classList.add('hidden-section');
                await new Promise(r => setTimeout(r, 80));

                const allFiles = await Files.readDirRecursive(handle, handle.name);
                if (!allFiles.length) {
                    UI.toast('Nenhum arquivo encontrado na pasta arrastada.', 'error');
                    UI.showSection(DOM.sectionUpload);
                    return;
                }

                const { totalStudents, totalFiles } = Files.process(allFiles);
                if (!totalStudents) {
                    UI.toast('Nenhuma pasta de aluno foi encontrada. Verifique a estrutura de pastas.', 'error');
                    UI.showSection(DOM.sectionUpload);
                    return;
                }

                UI.buildResultsUI(totalStudents, totalFiles);
                UI.showSection(DOM.sectionResults);
                UI.toast(`${totalStudents} alunos carregados via arrastar e soltar!`, 'success');
            } catch (err) {
                console.error('Erro ao ler pasta via File System Access API:', err);
                UI.toast('Erro ao ler a pasta arrastada. Tente clicar para selecionar.', 'error');
                UI.showSection(DOM.sectionUpload);
            }
        } else {
            UI.toast('Arrastar pastas não é suportado neste navegador. Clique para selecionar.', 'info');
        }
    },
};

// ══════════════════════════════════════════════════════════════
// GLOBAL BRIDGES
// Funções globais chamadas via onclick no HTML
// ══════════════════════════════════════════════════════════════
function openNomenclatureModal()         { Categories.openModal(); }
function closeNomenclatureModal()        { Categories.closeModal(); }
function confirmNomenclatureAndGenerate(){ Categories.confirmAndGenerate(); }
function toggleStudent(id)               { Categories._toggleStudent(id); }
function resetNomenclatureDefaults()     { Storage.reset(); }
function addNomenclatureCategory()       { Categories.addCategory(); }

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => App.init());

</script>
<!-- Service Worker Registration -->
<script>
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('[PWA] ServiceWorker registrado com sucesso:', reg.scope);
            }).catch(err => console.log('[PWA] Erro ao registrar ServiceWorker:', err));
        });
    }
</script>
</body>

</html>
