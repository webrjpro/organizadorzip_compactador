const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(targetPath, 'utf8');

// 1. Replace confirmAndGenerate
html = html.replace(
    /confirmAndGenerate\(\) \{\s*this\.closeModal\(\);\s*ZIP\.generate\(\);\s*\}/s,
    `confirmAndGenerate() {
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
    }`
);

// 2. Replace the Categories segment for addCategory and renderModal
const rxAddAndRender = /\/\*\* Adiciona nova categoria \*\/([\s\S]*?)_toggleStudent\(id\) \{/s;
html = html.replace(rxAddAndRender, `/** Remove uma categoria */
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
                ' class="flex-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 ' + (cat.isFallback ? 'bg-slate-50 cursor-not-allowed' : '') + '"' +
                ' placeholder="Nome da pasta">' +
                (cat.isFallback ? hiddenMsg : 
                '<input type="text" value="' + Utils.esc((cat.keywords || []).join(', ')) + '" data-idx="' + i + '" data-type="kw"' +
                ' class="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 text-slate-500"' +
                ' placeholder="palavras-chave separadas por vírgula">') +
                (!cat.isFallback ? 
                '<button class="btn-del-cat flex-shrink-0" onclick="removeNomenclatureCategory(' + i + ')" title="Remover categoria">' +
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
`);

// 3. Add to GLOBAL BRIDGES
html = html.replace(
    /function addNomenclatureCategory\(\)\s*\{ Categories\.addCategory\(\);\s*\}/s,
    `function addNomenclatureCategory()       { Categories.addCategory(); }\nfunction removeNomenclatureCategory(idx) { Categories.removeCategory(idx); }`
);

fs.writeFileSync(targetPath, html);
console.log('QA Bugs fixed successfully!');
