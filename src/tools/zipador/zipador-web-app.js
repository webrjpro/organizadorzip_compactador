const ZipadorWebApp = (() => {
    const state = {
        compressFiles: [],
        extractFile: null,
        extractZip: null,
        extractEntries: [],
        activeTab: 'compress',
        outputDirHandle: null,
        outputDirName: '',
        lastDownloadUrl: '',
    };

    const el = {};

    function byId(id) {
        return document.getElementById(id);
    }

    function show(node) {
        if (node) node.classList.remove('hidden-section');
    }

    function hide(node) {
        if (node) node.classList.add('hidden-section');
    }

    function setText(node, value) {
        if (node) node.textContent = value;
    }

    function formatNowTime() {
        return new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }

    function showSaveFeedback(fileName, mode) {
        if (!el.saveFeedback || !el.saveFeedbackText) return;

        const where = mode === 'file-system'
            ? 'salvo via "Salvar como"'
            : mode === 'output-dir'
                ? `salvo na pasta selecionada (${state.outputDirName || 'pasta escolhida'})`
            : 'baixado para Downloads (ou pasta padrão do navegador)';

        setText(
            el.saveFeedbackText,
            `Arquivo salvo: ${fileName} • ${where} • ${formatNowTime()}`
        );
        show(el.saveFeedback);
    }

    function clearManualDownloadLink() {
        if (!el.saveFeedbackLink) return;
        el.saveFeedbackLink.removeAttribute('href');
        el.saveFeedbackLink.removeAttribute('download');
        hide(el.saveFeedbackLink);
    }

    function setManualDownloadLink(blob, fileName) {
        if (!el.saveFeedbackLink) return;

        if (state.lastDownloadUrl) {
            URL.revokeObjectURL(state.lastDownloadUrl);
            state.lastDownloadUrl = '';
        }

        const url = URL.createObjectURL(blob);
        state.lastDownloadUrl = url;

        el.saveFeedbackLink.href = url;
        el.saveFeedbackLink.download = fileName;
        el.saveFeedbackLink.textContent = `Se não baixou automaticamente, clique aqui para baixar ${fileName}`;
        show(el.saveFeedbackLink);
    }

    function sanitizeLeafFileName(fileName) {
        return String(fileName || '')
            .replace(/[\\/]/g, '_')
            .replace(/\.\.+/g, '.')
            .replace(/[\x00-\x1F]/g, '_')
            .trim();
    }

    function updateOutputDirectoryStatus() {
        if (!el.outputDirText) return;

        if (state.outputDirHandle && state.outputDirName) {
            setText(el.outputDirText, `Pasta de saida: ${state.outputDirName}`);
            return;
        }

        setText(el.outputDirText, 'Pasta de saida: padrao do navegador (Downloads).');
    }

    function sanitizeOutputName(rawName) {
        const safe = String(rawName || '')
            .trim()
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        return safe || 'arquivo_compactado';
    }

    function normalizeZipPath(rawPath) {
        let path = String(rawPath || '')
            .replace(/\\/g, '/')
            .replace(/^[A-Za-z]:/, '')
            .replace(/^\/+/, '');

        if (!path) return null;

        const parts = path.split('/').filter(Boolean);
        if (!parts.length) return null;

        if (parts.some(part => part === '.' || part === '..' || part.includes('\0'))) {
            return null;
        }

        if (parts.some(part => part.includes(':'))) {
            return null;
        }

        return parts.join('/');
    }

    function getFileRelativePath(file) {
        if (file.webkitRelativePath && file.webkitRelativePath.trim()) {
            return file.webkitRelativePath;
        }
        return file.name || '';
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function pickSaveTarget(defaultFileName) {
        if (typeof window.showSaveFilePicker !== 'function') {
            return { type: 'download', reason: 'unsupported' };
        }

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultFileName,
                types: [
                    {
                        description: 'Arquivo ZIP',
                        accept: { 'application/zip': ['.zip'] },
                    },
                ],
            });
            return { type: 'file-handle', handle };
        } catch (error) {
            if (error && error.name === 'AbortError') {
                return null;
            }
            if (error && (error.name === 'SecurityError' || error.name === 'NotAllowedError' || error.name === 'TypeError')) {
                return { type: 'download', reason: error.name };
            }
            throw error;
        }
    }

    async function persistBlob(blob, fileName, target) {
        if (target && target.type === 'file-handle' && target.handle) {
            const writable = await target.handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return 'file-system';
        }

        if (state.outputDirHandle) {
            try {
                const safeName = sanitizeLeafFileName(fileName);
                const fileHandle = await state.outputDirHandle.getFileHandle(safeName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                return 'output-dir';
            } catch (error) {
                Logger.warn('[ZipadorWeb] Falha ao salvar na pasta selecionada. Usando download.', error);
                UI.toast('Nao foi possivel salvar na pasta selecionada. Usando Downloads.', 'info', 7000);
            }
        }

        downloadBlob(blob, fileName);
        return 'download';
    }

    async function chooseOutputDirectory() {
        if (typeof window.showDirectoryPicker !== 'function') {
            UI.toast('Seu navegador nao suporta escolher pasta de saida. Use Chrome/Edge ou o download padrao.', 'info', 9000);
            return;
        }

        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            state.outputDirHandle = handle;
            state.outputDirName = handle.name || 'pasta escolhida';
            updateOutputDirectoryStatus();
            UI.toast(`Pasta de saida definida: ${state.outputDirName}`, 'success', 7000);
        } catch (error) {
            if (error && error.name === 'AbortError') {
                UI.toast('Selecao de pasta cancelada.', 'info');
                return;
            }
            Logger.error('[ZipadorWeb] Falha ao selecionar pasta de saida', error);
            UI.toast(`Erro ao escolher pasta: ${error.message}`, 'error');
        }
    }

    function updateCompressSummary() {
        if (!state.compressFiles.length) {
            setText(el.compressSummary, 'Nenhum arquivo selecionado.');
            return;
        }

        const totalBytes = state.compressFiles.reduce((sum, file) => sum + (file.size || 0), 0);
        const count = state.compressFiles.length;
        setText(
            el.compressSummary,
            `${count} arquivo(s) selecionado(s) • ${Utils.formatBytes(totalBytes)}`
        );
    }

    function updateExtractSummary() {
        if (!state.extractFile) {
            setText(el.extractSummary, 'Nenhum ZIP selecionado.');
            return;
        }

        const fileName = state.extractFile.name || 'arquivo.zip';
        const fileSize = Utils.formatBytes(state.extractFile.size || 0);

        if (state.extractEntries.length) {
            setText(
                el.extractSummary,
                `${fileName} (${fileSize}) • ${state.extractEntries.length} arquivo(s) interno(s)`
            );
            return;
        }

        setText(el.extractSummary, `${fileName} (${fileSize})`);
    }

    function setCompressProgress(percent, message) {
        show(el.compressProgressWrap);
        if (el.compressProgressBar) el.compressProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        setText(el.compressProgressText, message);
    }

    function setExtractProgress(percent, message) {
        show(el.extractProgressWrap);
        if (el.extractProgressBar) el.extractProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        setText(el.extractProgressText, message);
    }

    function setButtonBusy(button, isBusy, busyText, idleText) {
        if (!button) return;
        button.disabled = !!isBusy;
        button.textContent = isBusy ? busyText : idleText;
    }

    function switchTab(tab) {
        state.activeTab = tab;
        const compressActive = tab === 'compress';

        if (compressActive) {
            show(el.compressPanel);
            hide(el.extractPanel);
            el.tabCompress.classList.add('bg-orange-500', 'text-white');
            el.tabCompress.classList.remove('bg-white', 'bg-opacity-5', 'text-slate-300');
            el.tabExtract.classList.remove('bg-orange-500', 'text-white');
            el.tabExtract.classList.add('bg-white', 'bg-opacity-5', 'text-slate-300');
            return;
        }

        hide(el.compressPanel);
        show(el.extractPanel);
        el.tabExtract.classList.add('bg-orange-500', 'text-white');
        el.tabExtract.classList.remove('bg-white', 'bg-opacity-5', 'text-slate-300');
        el.tabCompress.classList.remove('bg-orange-500', 'text-white');
        el.tabCompress.classList.add('bg-white', 'bg-opacity-5', 'text-slate-300');
    }

    function renderExtractList() {
        if (!el.extractList) return;

        if (!state.extractEntries.length) {
            el.extractList.textContent = 'Nenhum conteudo carregado.';
            return;
        }

        const maxRows = 200;
        const visibleEntries = state.extractEntries.slice(0, maxRows);

        const rows = visibleEntries
            .map(item => `<div class="py-1 border-b border-white border-opacity-5 last:border-0">${Utils.esc(item.safePath)}</div>`)
            .join('');

        const remainder = state.extractEntries.length - visibleEntries.length;
        const moreLine = remainder > 0
            ? `<div class="pt-2 text-slate-400">+ ${remainder} arquivo(s) adicional(is)</div>`
            : '';

        el.extractList.innerHTML = rows + moreLine;
    }

    function resetExtractState() {
        state.extractZip = null;
        state.extractEntries = [];
        renderExtractList();
        updateExtractSummary();
    }

    async function ensureZipLoaded() {
        if (!state.extractFile) {
            throw new Error('Selecione um arquivo ZIP primeiro.');
        }

        if (state.extractZip) return;

        setExtractProgress(5, 'Lendo arquivo ZIP...');
        const loadedZip = await JSZip.loadAsync(state.extractFile);
        state.extractZip = loadedZip;

        const entries = [];
        loadedZip.forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) return;
            const safePath = normalizeZipPath(relativePath);
            if (!safePath) return;
            entries.push({ entry: zipEntry, safePath });
        });

        state.extractEntries = entries;
        renderExtractList();
        updateExtractSummary();
        setExtractProgress(100, `ZIP analisado: ${entries.length} arquivo(s).`);
    }

    async function handleCompressInput(fileList) {
        state.compressFiles = Array.from(fileList || []).filter(Boolean);
        updateCompressSummary();
        hide(el.compressProgressWrap);
    }

    async function runCompression() {
        if (!state.compressFiles.length) {
            UI.toast('Selecione arquivos ou pasta para compactar.', 'error');
            return;
        }

        const zipName = sanitizeOutputName(el.compressName?.value);
        const level = Number.parseInt(el.compressLevel?.value || '6', 10);
        const clampedLevel = Number.isFinite(level) ? Math.max(0, Math.min(9, level)) : 6;
        const outputName = `${zipName}.zip`;

        setButtonBusy(el.compressRun, true, 'Compactando...', 'Compactar e Baixar ZIP');
        setCompressProgress(2, 'Preparando estrutura de compactacao...');

        try {
            const saveTarget = state.outputDirHandle ? { type: 'output-dir' } : await pickSaveTarget(outputName);
            if (saveTarget === null) {
                UI.toast('Salvamento cancelado.', 'info');
                return;
            }

            const zip = new JSZip();
            const uniquePaths = new Set();

            state.compressFiles.forEach((file, index) => {
                const rawPath = getFileRelativePath(file);
                const safePath = normalizeZipPath(rawPath) || sanitizeOutputName(file.name || `arquivo_${index + 1}`);
                const finalPath = uniquePaths.has(safePath)
                    ? `${safePath.replace(/(\.[^.]*)?$/, `_${index + 1}$1`)}`
                    : safePath;

                uniquePaths.add(finalPath);
                zip.file(finalPath, file);

                const preparePercent = Math.round(((index + 1) / state.compressFiles.length) * 25);
                setCompressProgress(preparePercent, `Preparando arquivos (${index + 1}/${state.compressFiles.length})...`);
            });

            const blob = await zip.generateAsync(
                {
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: clampedLevel },
                    streamFiles: true,
                },
                (meta) => {
                    const base = 25;
                    const range = 75;
                    const percent = base + Math.round((meta.percent / 100) * range);
                    setCompressProgress(percent, `Gerando ZIP... ${Math.round(meta.percent)}%`);
                }
            );

            const mode = await persistBlob(blob, outputName, saveTarget);
            setCompressProgress(100, 'Compactacao concluida com sucesso.');
            showSaveFeedback(outputName, mode);
            setManualDownloadLink(blob, outputName);
            UI.toast(
                mode === 'file-system'
                    ? 'ZIP salvo com sucesso!'
                    : mode === 'output-dir'
                        ? `ZIP salvo na pasta ${state.outputDirName || 'selecionada'}.`
                    : 'ZIP baixado para a pasta Downloads (ou pasta padrao do navegador).',
                'success',
                9000
            );
        } catch (error) {
            Logger.error('[ZipadorWeb] Falha na compactacao', error);
            UI.toast(`Erro ao compactar: ${error.message}`, 'error');
        } finally {
            setButtonBusy(el.compressRun, false, 'Compactando...', 'Compactar e Baixar ZIP');
        }
    }

    async function writeBlobToDirectory(rootHandle, relativePath, blob) {
        const parts = relativePath.split('/').filter(Boolean);
        let currentDir = rootHandle;

        for (let i = 0; i < parts.length - 1; i++) {
            currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
        }

        const fileName = parts[parts.length - 1];
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    }

    async function extractToDirectory() {
        setButtonBusy(el.extractToFolder, true, 'Extraindo...', 'Extrair para Pasta (Chrome/Edge)');

        try {
            await ensureZipLoaded();

            if (!state.extractEntries.length) {
                UI.toast('Nenhum arquivo valido encontrado para extracao.', 'error');
                return;
            }

            if (typeof window.showDirectoryPicker !== 'function') {
                UI.toast('Seu navegador nao suporta extracao direta para pasta. Use o download em ZIP.', 'info');
                return;
            }

            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const total = state.extractEntries.length;

            for (let i = 0; i < total; i++) {
                const item = state.extractEntries[i];
                const blob = await item.entry.async('blob');
                await writeBlobToDirectory(dirHandle, item.safePath, blob);
                const percent = Math.round(((i + 1) / total) * 100);
                setExtractProgress(percent, `Extraindo para pasta... (${i + 1}/${total})`);
            }

            UI.toast('Extracao concluida na pasta selecionada.', 'success');
        } catch (error) {
            if (error && error.name === 'AbortError') {
                UI.toast('Extracao cancelada pelo usuario.', 'info');
            } else {
                Logger.error('[ZipadorWeb] Falha ao extrair para pasta', error);
                UI.toast(`Erro ao extrair para pasta: ${error.message}`, 'error');
            }
        } finally {
            setButtonBusy(el.extractToFolder, false, 'Extraindo...', 'Extrair para Pasta (Chrome/Edge)');
        }
    }

    async function downloadExtractedAsZip() {
        setButtonBusy(el.extractDownload, true, 'Gerando...', 'Baixar Conteudo Extraido (.zip)');

        try {
            await ensureZipLoaded();

            if (!state.extractEntries.length) {
                UI.toast('Nenhum arquivo valido encontrado para exportacao.', 'error');
                return;
            }

            const outputZip = new JSZip();
            const total = state.extractEntries.length;
            const baseName = sanitizeOutputName((state.extractFile.name || 'conteudo').replace(/\.zip$/i, ''));
            const outputName = `${baseName}_extraido.zip`;
            const saveTarget = state.outputDirHandle ? { type: 'output-dir' } : await pickSaveTarget(outputName);

            if (saveTarget === null) {
                UI.toast('Salvamento cancelado.', 'info');
                return;
            }

            for (let i = 0; i < total; i++) {
                const item = state.extractEntries[i];
                const fileData = await item.entry.async('uint8array');
                outputZip.file(item.safePath, fileData);
                const percent = Math.round(((i + 1) / total) * 50);
                setExtractProgress(percent, `Preparando conteudo extraido... (${i + 1}/${total})`);
            }

            const blob = await outputZip.generateAsync(
                {
                    type: 'blob',
                    compression: 'DEFLATE',
                    compressionOptions: { level: 6 },
                    streamFiles: true,
                },
                (meta) => {
                    const percent = 50 + Math.round(meta.percent / 2);
                    setExtractProgress(percent, `Gerando ZIP extraido... ${Math.round(meta.percent)}%`);
                }
            );

            const mode = await persistBlob(blob, outputName, saveTarget);
            setExtractProgress(100, 'Exportacao concluida com sucesso.');
            showSaveFeedback(outputName, mode);
            setManualDownloadLink(blob, outputName);
            UI.toast(
                mode === 'file-system'
                    ? 'Conteudo extraido salvo com sucesso!'
                    : mode === 'output-dir'
                        ? `Conteudo extraido salvo na pasta ${state.outputDirName || 'selecionada'}.`
                    : 'Conteudo extraido baixado para a pasta Downloads (ou pasta padrao do navegador).',
                'success',
                9000
            );
        } catch (error) {
            Logger.error('[ZipadorWeb] Falha ao gerar ZIP extraido', error);
            UI.toast(`Erro ao exportar conteudo: ${error.message}`, 'error');
        } finally {
            setButtonBusy(el.extractDownload, false, 'Gerando...', 'Baixar Conteudo Extraido (.zip)');
        }
    }

    function hidePrimarySections() {
        const sectionIds = [
            'section-upload',
            'section-processing',
            'section-results',
            'section-csv',
            'section-report',
            'section-zipador-web',
        ];

        sectionIds.forEach((id) => {
            const section = byId(id);
            if (section) section.classList.add('hidden-section');
        });
    }

    function openSection() {
        hidePrimarySections();
        show(el.section);
        if (window.lucide && el.section) {
            lucide.createIcons({ nodes: [el.section] });
        }
    }

    function backToUpload() {
        hide(el.section);
        hide(byId('section-csv'));
        hide(byId('section-report'));
        hide(byId('section-processing'));
        hide(byId('section-results'));
        show(byId('section-upload'));
    }

    function bindEvents() {
        el.tabCompress.addEventListener('click', () => switchTab('compress'));
        el.tabExtract.addEventListener('click', () => switchTab('extract'));

        el.compressPickFiles.addEventListener('click', () => el.compressFilesInput.click());
        el.compressPickFolder.addEventListener('click', () => el.compressFolderInput.click());
        if (el.pickOutputDir) {
            el.pickOutputDir.addEventListener('click', () => chooseOutputDirectory());
        }

        el.compressFilesInput.addEventListener('change', (event) => {
            handleCompressInput(event.target.files);
            event.target.value = '';
        });

        el.compressFolderInput.addEventListener('change', (event) => {
            handleCompressInput(event.target.files);
            event.target.value = '';
        });

        el.compressRun.addEventListener('click', () => runCompression());

        el.extractPick.addEventListener('click', () => el.extractInput.click());
        el.extractInput.addEventListener('change', async (event) => {
            state.extractFile = event.target.files && event.target.files[0] ? event.target.files[0] : null;
            resetExtractState();
            hide(el.extractProgressWrap);
            updateExtractSummary();
            if (state.extractFile) {
                try {
                    await ensureZipLoaded();
                } catch (error) {
                    Logger.error('[ZipadorWeb] Falha ao analisar ZIP', error);
                    UI.toast(`Erro ao ler ZIP: ${error.message}`, 'error');
                    resetExtractState();
                }
            }
            event.target.value = '';
        });

        el.extractToFolder.addEventListener('click', () => extractToDirectory());
        el.extractDownload.addEventListener('click', () => downloadExtractedAsZip());
    }

    function init() {
        el.section = byId('section-zipador-web');
        if (!el.section) return;

        el.tabCompress = byId('zipador-tab-compress');
        el.tabExtract = byId('zipador-tab-extract');

        el.compressPanel = byId('zipador-panel-compress');
        el.extractPanel = byId('zipador-panel-extract');

        el.compressPickFiles = byId('zipador-compress-pick-files');
        el.compressPickFolder = byId('zipador-compress-pick-folder');
        el.compressFilesInput = byId('zipador-compress-files-input');
        el.compressFolderInput = byId('zipador-compress-folder-input');
        el.compressSummary = byId('zipador-compress-summary');
        el.compressName = byId('zipador-compress-name');
        el.compressLevel = byId('zipador-compress-level');
        el.compressRun = byId('zipador-compress-run');
        el.compressProgressWrap = byId('zipador-compress-progress-wrap');
        el.compressProgressBar = byId('zipador-compress-progress-bar');
        el.compressProgressText = byId('zipador-compress-progress-text');
        el.saveFeedback = byId('zipador-save-feedback');
        el.saveFeedbackText = byId('zipador-save-feedback-text');
        el.saveFeedbackLink = byId('zipador-save-feedback-link');
        el.pickOutputDir = byId('zipador-pick-output-dir');
        el.outputDirText = byId('zipador-output-dir-text');

        el.extractPick = byId('zipador-extract-pick');
        el.extractInput = byId('zipador-extract-input');
        el.extractSummary = byId('zipador-extract-summary');
        el.extractToFolder = byId('zipador-extract-to-folder');
        el.extractDownload = byId('zipador-extract-download');
        el.extractProgressWrap = byId('zipador-extract-progress-wrap');
        el.extractProgressBar = byId('zipador-extract-progress-bar');
        el.extractProgressText = byId('zipador-extract-progress-text');
        el.extractList = byId('zipador-extract-list');

        bindEvents();
        switchTab('compress');
        updateCompressSummary();
        updateExtractSummary();
        updateOutputDirectoryStatus();
        clearManualDownloadLink();

        window.addEventListener('beforeunload', () => {
            if (state.lastDownloadUrl) {
                URL.revokeObjectURL(state.lastDownloadUrl);
                state.lastDownloadUrl = '';
            }
        });
    }

    return {
        init,
        openSection,
        backToUpload,
    };
})();

window.ZipadorWebApp = ZipadorWebApp;
