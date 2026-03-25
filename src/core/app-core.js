        // ==========================================================
        // CONSTANTES GLOBAIS (legado — substituídas pelo objeto Config abaixo)
        // ==========================================================
        // Categorias padrão com nome de pasta e palavras-chave detectadas automaticamente.
        // isFallback: true → última categoria (Geral), recebe arquivos sem correspondência.
        // Estas são copiadas para `userCategories` e podem ser editadas pela gestora no modal.

// ══════════════════════════════════════════════════════════════
// CONFIG — Constantes globais e configurações imutáveis
// ══════════════════════════════════════════════════════════════
const Config = {
    MAX_ZIP_SIZE: 15 * 1024 * 1024,          // Limite declarado: 15 MB
    SAFE_RAW_LIMIT: 13 * 1024 * 1024,        // Limite real (margem p/ compressão DEFLATE)
    PDF_COMPRESS_THRESHOLD: 5 * 1024 * 1024, // PDFs acima disto serão comprimidos
    STORAGE_KEY: 'org_alunos_categories_v1',

    IGNORED_FILES: new Set(['.ds_store', 'thumbs.db', 'desktop.ini', '.gitkeep']),

    COLOR_PALETTE: [
        { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
        { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
        { bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
        { bg: '#fef9c3', text: '#a16207', dot: '#eab308' },
        { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
        { bg: '#fce7f3', text: '#9d174d', dot: '#ec4899' },
        { bg: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
        { bg: '#ccfbf1', text: '#0f766e', dot: '#14b8a6' },
        { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
        { bg: '#e0f2fe', text: '#0369a1', dot: '#0ea5e9' },
        { bg: '#f0fdf4', text: '#166534', dot: '#4ade80' },
        { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
    ],

    DEFAULT_CATEGORIES: [
        { name: 'Documentos de Alunos', keywords: ['rg', 'cpf', 'identidade', 'certidao nascimento', '3x4', 'foto', 'diploma graduacao'] },
        { name: 'E-mail',               keywords: ['email', 'e-mail', 'e_mail'] },
        { name: 'Atestado',             keywords: ['atestado', 'laudo', 'comprovante medico'] },
        { name: 'Formulários',          keywords: ['formulario', 'ficha', 'matricula', 'inscricao'] },
        { name: 'Declarações e Diplomas', keywords: ['declaracao', 'diploma'] },
        { name: 'Termos',               keywords: ['termo', 'contrato', 'adesao'] },
        { name: 'TCC / Monografia',     keywords: ['tcc', 'monografia', 'trabalho conclusao', 'dissertacao'] },
        { name: 'Eventos',              keywords: ['evento', 'palestra', 'workshop', 'certificado'] },
        { name: 'PDF Não encontrado',   keywords: [], isFallback: true },
    ],
};

// ══════════════════════════════════════════════════════════════
// BUILD INFO / LOGGER — Observabilidade e diagnóstico
// ══════════════════════════════════════════════════════════════
const BuildInfo = Object.freeze({
    APP_NAME: 'Organizador Automático de Alunos',
    VERSION: '2026.03.25',
    ENV: (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'development' : 'production',
});

const Logger = (() => {
    const levels = { debug: 10, info: 20, warn: 30, error: 40 };
    const debugEnabled = /[?&]debug=1\b/.test(location.search) || BuildInfo.ENV === 'development';
    const minLevel = debugEnabled ? levels.debug : levels.info;

    function shouldLog(level) {
        return levels[level] >= minLevel;
    }

    function emit(level, ...args) {
        if (!shouldLog(level)) return;
        const prefix = `[${BuildInfo.APP_NAME}]`;
        const fn = console[level] || console.log;
        fn(prefix, ...args);
    }

    return {
        debug: (...args) => emit('debug', ...args),
        info:  (...args) => emit('info', ...args),
        warn:  (...args) => emit('warn', ...args),
        error: (...args) => emit('error', ...args),
    };
})();

// ══════════════════════════════════════════════════════════════
// STATE — Estado mutável centralizado da aplicação
// ══════════════════════════════════════════════════════════════
const State = {
    studentsData: {},      // { "Nome Aluno": [{ file, catName, originalName }, ...] }
    userCategories: [],    // Cópia editável de DEFAULT_CATEGORIES (persiste no localStorage)
};

// ══════════════════════════════════════════════════════════════
// DOM — Referências centralizadas aos elementos do HTML
// (populadas por DOM.init() após DOMContentLoaded)
// ══════════════════════════════════════════════════════════════
const DOM = {
    init() {
        const $ = id => document.getElementById(id);
        this.sectionUpload      = $('section-upload');
        this.sectionProcessing  = $('section-processing');
        this.sectionResults     = $('section-results');
        this.fileInput          = $('file-input');
        this.dropZone           = $('drop-zone');
        this.statusText         = $('status-text');
        this.statusSub          = $('status-sub');
        this.progressContainer  = $('progress-container');
        this.progressBar        = $('progress-bar');
        this.progressLabel      = $('progress-label');
        this.fileProgressContainer = $('file-progress-container');
        this.fileProgressText   = $('file-progress-text');
        this.fileProgressBar    = $('file-progress-bar');
        this.summaryText        = $('summary-text');
        this.previewList        = $('preview-list');
        this.btnGenerate        = $('btn-generate');
        this.btnReport          = $('btn-report');
        this.btnRestart         = $('btn-restart');
        this.searchInput        = $('search-input');
        this.sortSelect         = $('sort-select');
        this.listCount          = $('list-count');
        this.toastContainer     = $('toast-container');
        this.modalOverlay       = $('modal-overlay');
        this.modalList          = $('modal-list');
        this.saveBadge          = $('save-badge');
    },
};

// ══════════════════════════════════════════════════════════════
// ACTION BUS — Delegação de eventos via data-action
// ══════════════════════════════════════════════════════════════
const ActionBus = {
    _started: false,
    _handlers: {
        'pick-folder':      () => document.getElementById('file-input')?.click(),
        'pick-spreadsheet': () => document.getElementById('csv-file-input')?.click(),
        'close-modal':      () => Categories.closeModal(),
        'add-category':     () => Categories.addCategory(),
        'reset-categories': () => Storage.reset(),
        'confirm-generate': () => Categories.confirmAndGenerate(),
        'toggle-student':   (el) => Categories._toggleStudent(el.dataset.id),
        'remove-category':  (el) => Categories.removeCategory(Number(el.dataset.idx)),
    },

    init() {
        if (this._started) return;
        this._started = true;

        document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-action]');
            if (!trigger) return;
            const action = trigger.dataset.action;
            const handler = this._handlers[action];
            if (!handler) return;

            event.preventDefault();
            try {
                handler(trigger, event);
            } catch (err) {
                Logger.error(`Falha ao executar ação "${action}"`, err);
                UI.toast('Falha ao executar a ação solicitada.', 'error');
            }
        });
    },
};

// ══════════════════════════════════════════════════════════════
// UTILS — Funções utilitárias puras (sem efeitos colaterais)
// ══════════════════════════════════════════════════════════════
const Utils = {
    /** Remove acentos e coloca em minúsculas */
    normalizeStr: s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),

    /** Escapa caracteres especiais HTML (prevenção de XSS) */
    esc: s => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'),

    /** Formata bytes em KB ou MB legível */
    formatBytes: b => b < 1024 * 1024
        ? (b / 1024).toFixed(1) + ' KB'
        : (b / (1024 * 1024)).toFixed(2) + ' MB',
};

// ══════════════════════════════════════════════════════════════
// STORAGE — Persistência das configurações no localStorage
// ══════════════════════════════════════════════════════════════
const Storage = {
    /** Carrega as categorias do localStorage (ou retorna os padrões) */
    load() {
        try {
            const raw = localStorage.getItem(Config.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch (_) { /* JSON inválido — usa padrão */ }
        return Config.DEFAULT_CATEGORIES.map(c => ({ ...c, keywords: [...(c.keywords || [])] }));
    },

    /** Persiste as categorias actuais no localStorage */
    save() {
        try {
            localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(State.userCategories));
        } catch (_) { /* quota ou modo privado — falha silenciosa */ }
        // Feedback visual de "Salvo"
        if (DOM.saveBadge) {
            DOM.saveBadge.style.opacity = '1';
            clearTimeout(DOM.saveBadge._t);
            DOM.saveBadge._t = setTimeout(() => { DOM.saveBadge.style.opacity = '0'; }, 2500);
        }
    },

    /** Restaura as categorias para os valores padrão */
    reset() {
        State.userCategories = Config.DEFAULT_CATEGORIES.map(c => ({
            ...c, keywords: [...(c.keywords || [])],
        }));
        this.save();
        Categories.renderModal();
    },
};

// ══════════════════════════════════════════════════════════════
// UI — Renderização e interação com a interface
// ══════════════════════════════════════════════════════════════

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

const UI = {
    /**
     * Exibe uma notificação temporária flutuante.
     * @param {string} msg     Texto da mensagem
     * @param {'success'|'error'|'info'} type  Tipo visual
     * @param {number} duration  Duração em ms (padrão 4000)
     */
    toast(msg, type = 'info', duration = 4000) {
        const icons = { success: 'circle-check', error: 'x-circle', info: 'info' };
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.innerHTML = `<i data-lucide="${icons[type]}" style="width:18px;height:18px;flex-shrink:0"></i><span>${msg}</span>`;
        DOM.toastContainer.appendChild(el);
        lucide.createIcons({ nodes: [el] });
        setTimeout(() => {
            el.classList.add('hide');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }, duration);
    },

    /** Esconde todas as secções e exibe apenas a indicada */
    showSection(s) {
        [DOM.sectionUpload, DOM.sectionProcessing, DOM.sectionResults]
            .forEach(x => x.classList.add('hidden-section'));
        s.classList.remove('hidden-section');
    },

    /** Atualiza os cards de estatísticas e redesenha a lista */
    buildResultsUI(totalStudents, totalFiles) {
        const allCats = new Set();
        let uncategorized = 0;
        const fallbackName = (State.userCategories.find(c => c.isFallback) || { name: 'PDF Não encontrado' }).name;

        for (const files of Object.values(State.studentsData)) {
            for (const f of files) {
                allCats.add(f.catName);
                if (f.catName === fallbackName) uncategorized++;
            }
        }

        document.getElementById('stat-students').textContent    = totalStudents;
        document.getElementById('stat-files').textContent       = totalFiles;
        document.getElementById('stat-categories').textContent  = allCats.size;
        document.getElementById('stat-uncategorized').textContent = uncategorized;
        DOM.summaryText.innerHTML = `<strong>${totalStudents}</strong> alunos &middot; <strong>${totalFiles}</strong> ficheiros lidos`;

        this.renderStudentList(Object.entries(State.studentsData));
    },

    /** Redesenha a lista de alunos (com filtro e ordenação actuais) */
    renderStudentList(entries) {
        DOM.previewList.innerHTML = '';

        if (!entries.length) {
            DOM.previewList.innerHTML = `<div class="text-center py-12 text-slate-400"><i data-lucide="search-x" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i><p class="text-sm">Nenhum aluno encontrado.</p></div>`;
            DOM.listCount.textContent = '0 alunos';
            lucide.createIcons({ nodes: [DOM.previewList] });
            return;
        }

        DOM.listCount.textContent = `${entries.length} aluno${entries.length !== 1 ? 's' : ''}`;
        const frag = document.createDocumentFragment();

        entries.forEach(([name, files], idx) => {
            const counts = {};
            for (const f of files) counts[f.catName] = (counts[f.catName] || 0) + 1;

            const badgesHTML = Object.entries(counts).map(([catName, c]) => {
                const col = Categories.getColor(catName);
                return `<span class="badge" style="background:${col.bg};color:${col.text}">${Utils.esc(catName)} <strong style="margin-left:4px">${c}</strong></span>`;
            }).join('');

            const filesHTML = files.slice(0, 8).map(f => {
                const col = Categories.getColor(f.catName);
                return `<div class="flex items-center gap-2 text-xs text-slate-500 py-0.5">
                    <i data-lucide="file" class="w-3 h-3 flex-shrink-0 text-slate-300"></i>
                    <span class="truncate" title="${Utils.esc(f.originalName)}">${Utils.esc(f.originalName)}</span>
                    <span class="badge ml-auto flex-shrink-0" style="background:${col.bg};color:${col.text}">${Utils.esc(f.catName)}</span>
                </div>`;
            }).join('');

            const moreCount = files.length > 8 ? files.length - 8 : 0;
            const id = `s${idx}`;
            const row = document.createElement('div');
            row.className = 'student-row';
            row.innerHTML = `
                <button type="button" class="w-full text-left px-5 py-4 flex items-center justify-between gap-3 focus:outline-none focus:bg-indigo-50"
                    data-action="toggle-student" data-id="${id}" aria-expanded="false">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <i data-lucide="folder-archive" class="w-4 h-4 text-indigo-600"></i>
                        </div>
                        <span class="font-semibold text-slate-800 text-sm truncate">${Utils.esc(name)}</span>
                        <span class="text-xs text-slate-400 flex-shrink-0">${files.length} ficheiro${files.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <div class="hidden md:flex flex-wrap gap-1 justify-end">${badgesHTML}</div>
                        <i data-lucide="chevron-down" id="${id}-chev" class="w-4 h-4 text-slate-400 transition-transform flex-shrink-0"></i>
                    </div>
                </button>
                <div id="${id}-body" class="hidden px-5 pb-4 space-y-1 bg-slate-50">
                    <div class="flex flex-wrap gap-1 mb-3 md:hidden">${badgesHTML}</div>
                    ${filesHTML}
                    ${moreCount > 0 ? `<p class="text-xs text-slate-400 mt-1">+ ${moreCount} ficheiro(s) adicionais...</p>` : ''}
                </div>`;
            frag.appendChild(row);
        });

        DOM.previewList.appendChild(frag);
        lucide.createIcons({ nodes: [DOM.previewList] });
    },

    /** Aplica filtro de busca e ordenação à lista */
    applyFiltersAndSort() {
        const q = DOM.searchInput.value.trim().toLowerCase();
        const s = DOM.sortSelect.value;
        let entries = Object.entries(State.studentsData);
        if (q) entries = entries.filter(([n]) => n.toLowerCase().includes(q));
        entries.sort(([na, fa], [nb, fb]) => {
            if (s === 'name-asc')   return na.localeCompare(nb);
            if (s === 'name-desc')  return nb.localeCompare(na);
            if (s === 'files-desc') return fb.length - fa.length;
            if (s === 'files-asc')  return fa.length - fb.length;
            return 0;
        });
        UI.renderStudentList(entries);
    },
};

// ══════════════════════════════════════════════════════════════
// CATEGORIES — Gestão de categorias e modal de nomenclaturas
// ══════════════════════════════════════════════════════════════
const Categories = {
    /** Devolve a cor de uma categoria pelo nome */
    getColor(name) {
        const idx = State.userCategories.findIndex(c => c.name === name);
        return Config.COLOR_PALETTE[Math.max(0, idx) % Config.COLOR_PALETTE.length];
    },

    /** Classifica um ficheiro numa categoria com base nas palavras-chave */
    categorize(fileName) {
        const n = Utils.normalizeStr(fileName);
        for (const cat of State.userCategories) {
            if (cat.isFallback) continue;
            if (cat.keywords.some(kw => n.includes(Utils.normalizeStr(kw)))) return cat.name;
        }
        return (State.userCategories.find(c => c.isFallback) || State.userCategories.at(-1)).name;
    },

    /** Abre o modal (valida se há dados antes) */
    openModal() {
        if (!Object.keys(State.studentsData).length) {
            UI.toast('Nenhum dado carregado. Selecione uma pasta primeiro.', 'error');
            return;
        }
        this.renderModal();
        DOM.modalOverlay.classList.remove('hidden-section');
    },

    /** Fecha o modal */
    closeModal() {
        DOM.modalOverlay.classList.add('hidden-section');
    },

    /** Confirma as nomenclaturas e dispara a geração */
    confirmAndGenerate() {
        this.closeModal();
        // [QA FIX] Re-categorizar ficheiros existentes baseando-se nas categorias atualizadas
        for (const sFiles of Object.values(State.studentsData)) {
            for (const f of sFiles) {
                f.catName = this.categorize(f.originalName);
            }
        }
        // Atualiza UI para refletir as novas categorias (caso mude de ideias e não faça download)
        UI.buildResultsUI(Object.keys(State.studentsData).length, Object.values(State.studentsData).reduce((s, arr) => s+arr.length, 0));
        ZIP.generate();
    },


    /** Remove uma categoria */
    removeCategory(idx) {
        if (State.userCategories[idx].isFallback) return; // Não permitir remover o fallback
        State.userCategories.splice(idx, 1);
        this.renderModal();
        Storage.save();
    },

    /** Adiciona nova categoria */
    addCategory() {
        const fbIndex = State.userCategories.findIndex(c => c.isFallback);
        const newCat = { name: '', keywords: [] };
        if (fbIndex >= 0) {
            State.userCategories.splice(fbIndex, 0, newCat);
        } else {
            State.userCategories.push(newCat);
        }
        this.renderModal();
        Storage.save();
        setTimeout(() => {
            const inputs = DOM.modalList.querySelectorAll('input[placeholder="Nome da pasta"]:not([readonly])');
            if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50);
    },

    /** Renderiza a lista de categorias no modal */
    renderModal() {
        DOM.modalList.innerHTML = '';
        const frag = document.createDocumentFragment();
        // O evento não deve ser recriado sempre que se faz append, então resetamos para evitar leaks
        const newModalList = DOM.modalList.cloneNode(false);
        DOM.modalList.parentNode.replaceChild(newModalList, DOM.modalList);
        DOM.modalList = newModalList;

        State.userCategories.forEach((cat, i) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 ' + (cat.isFallback ? 'is-fallback' : '');
            const col = Config.COLOR_PALETTE[i % Config.COLOR_PALETTE.length];
            
            const readonlyAttr = cat.isFallback ? 'readonly title="Categoria padrão obrigatória"' : '';
            const hiddenMsg = cat.isFallback ? '<div class="flex-1 text-xs text-slate-400 italic px-3" title="Ficheiros não combinados com as outras categorias cairão aqui.">Subpasta geral (sem palavra-chave)</div>' : '';
            
            row.innerHTML = '<span class="w-3 h-3 rounded-full flex-shrink-0" style="background:' + col.dot + '"></span>' +
                '<input type="text" value="' + Utils.esc(cat.name) + '" data-idx="' + i + '" ' + readonlyAttr +
                ' class="cat-input flex-1 ' + (cat.isFallback ? 'opacity-50 cursor-not-allowed' : '') + '"' +
                ' placeholder="Nome da pasta">' +
                (cat.isFallback ? hiddenMsg : 
                '<input type="text" value="' + Utils.esc((cat.keywords || []).join(', ')) + '" data-idx="' + i + '" data-type="kw"' +
                ' class="cat-input flex-1 text-indigo-200"' +
                ' placeholder="palavras-chave separadas por vírgula">') +
                (!cat.isFallback ? 
                '<button type="button" class="btn-del-cat flex-shrink-0" data-action="remove-category" data-idx="' + i + '" title="Remover categoria">' +
                '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
                '</button>' : '<div class="w-6 flex-shrink-0"></div>');
            frag.appendChild(row);
        });
        DOM.modalList.appendChild(frag);

        lucide.createIcons({ nodes: [DOM.modalList] });

        // Evento único para todos os inputs (delegação)
        DOM.modalList.addEventListener('input', e => {
            const el = e.target;
            if (!el.dataset.idx || el.readOnly) return;
            const i = +el.dataset.idx;
            if (el.dataset.type === 'kw') {
                State.userCategories[i].keywords = el.value.split(',').map(s => s.trim()).filter(Boolean);
            } else {
                State.userCategories[i].name = el.value;
            }
            Storage.save();
        });
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
            
            const renderContext = { canvasContext: canvas.getContext('2d'), viewport };
            await page.render(renderContext).promise;
            
            const orientation = viewport.width > viewport.height ? 'l' : 'p';
            doc.addPage([viewport.width, viewport.height], orientation);
            doc.addImage(canvas.toDataURL('image/jpeg', 0.6), 'JPEG', 0, 0, viewport.width, viewport.height);
            
            // Release memory for each page to prevent OOM
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
        }

        const result = new Uint8Array(doc.output('arraybuffer'));
        pdf.destroy(); // Crucial to release worker memory
        return result;
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
                            }
                        } catch (err) {
                            console.error('Erro ao comprimir PDF:', item.originalName, err);
                        }
                    }
                }

                // — Etapa 2: Geração dos ZIPs por categoria —
                DOM.statusText.textContent = `A compactar para Disco Virtual: ${name}`;
                DOM.statusSub.textContent  = `Aluno ${i + 1} de ${names.length} · ${sFiles.length} ficheiro(s)`;

                const studentZips = ZIP.buildCategoryOrdered(name, sFiles);
                if (studentZips.length > 1) splitCount++;

                let zipIdx = 0;
                for (const { zipName, zip } of studentZips) {
                    zipIdx++;
                    const partLabel = studentZips.length > 1 ? ` (parte ${zipIdx}/${studentZips.length})` : '';
                    DOM.fileProgressText.textContent = `A gerar ${zipName}${partLabel}...`;
                    DOM.fileProgressBar.style.width  = '0%';

                    const blob = await zip.generateAsync(
                        { type: 'blob', compression: 'STORE' },
                        meta => {
                            DOM.fileProgressBar.style.width = `${Math.round(meta.percent)}%`;
                            if (meta.currentFile) DOM.fileProgressText.textContent = meta.currentFile;
                        }
                    );
                    
                    // Salvar no IndexedDB e registar o nome
                    await DB.put(zipName, blob);
                    generatedZipNames.push(zipName);
                }

                filesProcessed += sFiles.length;
                const pct = Math.round((filesProcessed / totalAllFiles) * 100);
                DOM.progressBar.style.width   = `${pct}%`;
                DOM.progressLabel.textContent = `${pct}%`;
                
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
                DOM.fileProgressText.textContent = `A indexar ${zName}...`;
                DOM.fileProgressBar.style.width = `${Math.round((i / generatedZipNames.length) * 100)}%`;
                
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

            // APAGAR O DISCO VIRTUAL PARA LIMPAR O ESPAÇO
            await DB.clear();

            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            UI.toast(`Download concluído em ${elapsed}s — ${generatedZipNames.length} ZIPs gerados!`, 'success', 6000);
            if (splitCount > 0) {
                setTimeout(() => UI.toast(
                    `${splitCount} aluno(s) excediam 13MB e foram divididos em múltiplos ZIPs.`, 'info', 8000
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
.card b{font-size:26px;display:block}.card span{font-size:12px;color:#94a3b8}
        /* ─── SCROLL PARA A TABELA DE RESULTADOS DO CSV ─── */
        .excel-view table th { white-space: nowrap; }
        .excel-view table td { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
    </style>
</head>

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
// RUNTIME — Guardas de execução e monitoramento global de erros
// ══════════════════════════════════════════════════════════════
const Runtime = {
    validateDependencies() {
        const missing = [];
        if (typeof JSZip === 'undefined') missing.push('JSZip');
        if (!window.pdfjsLib) missing.push('pdfjsLib');
        if (!window.jspdf?.jsPDF) missing.push('jsPDF');
        if (!window.lucide) missing.push('lucide');

        if (missing.length) {
            const msg = `Dependências ausentes: ${missing.join(', ')}`;
            Logger.error(msg);
            try { UI.toast(msg, 'error', 9000); } catch (_) { alert(msg); }
            return false;
        }
        return true;
    },
};

const ErrorMonitor = {
    _started: false,
    _lastToastAt: 0,

    init() {
        if (this._started) return;
        this._started = true;

        window.addEventListener('error', (event) => {
            Logger.error('Erro global não tratado', event.error || event.message);
            this._notify();
        });

        window.addEventListener('unhandledrejection', (event) => {
            Logger.error('Promise rejeitada sem tratamento', event.reason);
            this._notify();
        });
    },

    _notify() {
        const now = Date.now();
        if (now - this._lastToastAt < 4000) return;
        this._lastToastAt = now;
        try {
            UI.toast('Ocorreu um erro inesperado. Verifique o console para detalhes.', 'error', 7000);
        } catch (_) { /* sem UI disponível */ }
    },
};

// ══════════════════════════════════════════════════════════════
// APP — Inicialização e registro centralizado de eventos
// ══════════════════════════════════════════════════════════════
const App = {
    _initialized: false,

    /** Ponto de entrada: chamado após DOMContentLoaded */
    init() {
        if (this._initialized) return;
        this._initialized = true;

        ErrorMonitor.init();
        DOM.init();
        ActionBus.init();
        State.userCategories = Storage.load();
        Runtime.validateDependencies();
        DB.init().catch(err => Logger.error('Falha ao inicializar IndexedDB', err));
        this._registerEvents();
        if (window.lucide) lucide.createIcons();
        Logger.info(`Boot concluído — versão ${BuildInfo.VERSION} (${BuildInfo.ENV})`);
    },

    /** Registra todos os event listeners da aplicação */
    _registerEvents() {
        // Zona de upload — clique gerenciado pelos botões internos

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

    /** Trata o evento de drop — reconhece automaticamente pastas ou planilhas Excel/CSV */
    async _handleDrop(e) {
        e.preventDefault();
        DOM.dropZone.classList.remove('drag-over');
        const items = [...(e.dataTransfer.items || [])];
        const first = items[0];

        if (!first) return;

        // Tentativa via File System Access API (Chrome/Edge)
        if (typeof first.getAsFileSystemHandle === 'function') {
            try {
                const handle = await first.getAsFileSystemHandle();

                if (handle.kind === 'file') {
                    const file = await handle.getFile();
                    if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
                        handleSmartCsvUpload(file);
                        return;
                    } else {
                        UI.toast('Arquivo n\u00e3o suportado. Arraste uma pasta ou planilha Excel/CSV.', 'error');
                        return;
                    }
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
                // File System Access API falhou -- tenta fallback via dataTransfer.files
                console.warn('[_handleDrop] FSAPI error, trying fallback:', err && err.message);
                const dtFiles = e.dataTransfer.files;
                if (dtFiles && dtFiles.length > 0) {
                    const ff = dtFiles[0];
                    if (ff.name.match(/\.(xlsx|xls|csv)$/i)) {
                        handleSmartCsvUpload(ff);
                        return;
                    }
                    // pode ser pasta (Chrome permite arrastar pastas sem FSAPI em alguns casos)
                    // exibe mensagem clara
                }
                UI.toast('N\u00e3o foi poss\u00edvel ler o item via API. Use os bot\u00f5es para selecionar.', 'info');
                UI.showSection(DOM.sectionUpload);
            }
        } else {
            const dtFiles = e.dataTransfer.files;
            if (dtFiles && dtFiles.length > 0 && dtFiles[0].name.match(/\.(xlsx|xls|csv)$/i)) {
                handleSmartCsvUpload(dtFiles[0]);
            } else {
                UI.toast('Arrastar pastas não suportado neste navegador. Clique para selecionar.', 'info');
            }
        }
    },
};

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    try {
        App.init();
        CsvApp.init();
        ReportApp.init();
    } catch (err) {
        Logger.error('Falha durante o bootstrap da aplicação', err);
        UI.toast('Falha ao iniciar a aplicação. Atualize a página e tente novamente.', 'error');
    }

    // Listener explícito para clique nos inputs caso não usem o Drop
    const csvInput = document.getElementById('csv-file-input');
    if (csvInput) {
        csvInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleSmartCsvUpload(e.target.files[0]);
                e.target.value = '';
            }
        });
    }
});


