# 🧠 Lógica do Sistema — Organizador de Alunos

Documentação técnica do fluxo de processamento e das principais funções do `index.html`.

---

## 🔄 Fluxo geral

```
Seleção da Pasta (clique ou drag & drop)
      ↓
Files.process() — identifica alunos e categoriza arquivos
      ↓
UI.buildResultsUI() — renderiza lista de alunos na tela
      ↓
[Usuário clica em "Gerar"]
      ↓
Categories.openModal() — modal para editar nomes/palavras-chave das pastas
      ↓
Categories.confirmAndGenerate()
  └─ Re-categoriza todos os arquivos com as categorias atualizadas
  └─ UI.buildResultsUI() — atualiza a UI
  └─ ZIP.generate()
      ↓
Download do ZIP mestre (Lote_Alunos_YYYY-MM-DD.zip)
```

---

## 📂 Identificação de Alunos

**Objeto:** `Files`  
**Função:** `Files.process(files)`

- Recebe todos os `File` objects selecionados
- Extrai o nome do aluno a partir do **segundo nível de pasta** (`partes[1]`)
- Ignora arquivos de sistema: `.DS_Store`, `Thumbs.db`, `desktop.ini`, etc.
- Organiza em `State.studentsData = { "Nome do Aluno": [{ file, catName, originalName }] }`
- Suporta **drag & drop via File System Access API** (`Files.readDirRecursive`)

---

## 🏷️ Categorização Automática

**Objeto:** `Categories`  
**Função:** `Categories.categorize(originalName)`

Cada arquivo é comparado com as **palavras-chave** de cada categoria (salvas em `State.userCategories`):

| Categoria | Palavras-chave |
|---|---|
| Documentos de Alunos | rg, cpf, identidade, certidao, 3x4, foto, diploma graduacao |
| E-mail | email, e-mail |
| Atestado | atestado, laudo, comprovante medico |
| Formulários | formulario, ficha, matricula, inscricao |
| Declarações e Diplomas | declaracao, diploma |
| Termos | termo, contrato, adesao |
| TCC / Monografia | tcc, monografia, dissertacao |
| Eventos | evento, palestra, certificado |
| PDF Não encontrado | *(fallback — recebe tudo que não se encaixou)* |

As categorias são **editáveis** pelo modal:
- `Categories.addCategory()` — insere nova categoria antes do fallback
- `Categories.removeCategory(idx)` — remove categoria (fallback não pode ser removido)
- `Categories.renderModal()` — redesenha a lista com delegação de eventos
- Salvas em `localStorage` via `Storage.save()`

---

## 📦 Geração de ZIPs

**Objeto:** `ZIP`  
**Função:** `ZIP.generate()`

### Passo 1 — Inicialização do Disco Virtual

```js
await DB.init();   // IndexedDB: 'EduVault_Swap' objectStore 'swap'
await DB.clear();  // Garante espaço limpo
```

### Passo 2 — Compressão condicional de PDFs

Se `totalStudentSize > Config.SAFE_RAW_LIMIT` (13MB):
- Escaneia arquivos em busca de PDFs > `Config.PDF_COMPRESS_THRESHOLD` (5MB)
- Aplica `PDF.compress()` — renderiza cada página em `<canvas>` e reexporta como JPEG (jsPDF)
- Substitui `item.file` pelo blob comprimido (ou mantém o original se maior)

### Passo 3 — ZIPs por aluno → IndexedDB

**Função:** `ZIP.buildCategoryOrdered(studentName, studentFiles)`

- Percorre categorias na ordem configurada
- Agrupa arquivos por categoria, adicionando até **13MB bruto** por ZIP
- Ao atingir o limite, fecha o ZIP atual e abre novo: `_parte2`, `_parte3`...
- Gera cada ZIP com `compression: 'STORE'` (rápido, sem double-compress)
- **Grava o blob no IndexedDB** via `DB.put(zipName, blob)` em vez de manter na RAM
- Libera `item.file = null` após cada aluno para evitar Out of Memory

### Passo 4 — ZIP Mestre

- Lê todos os blobs do IndexedDB via `DB.get(zName)`
- Empacota num ZIP mestre com `compression: 'STORE'`
- Nome: `Lote_Alunos_YYYY-MM-DD.zip`
- Faz download automático e chama `DB.clear()` para limpar o disco virtual

---

## 💾 IndexedDB Swap (Objeto `DB`)

Evita Out of Memory em lotes grandes ao usar o IndexedDB como disco virtual:

```js
DB.init()        // Abre/cria 'EduVault_Swap' → objectStore 'swap'
DB.put(key, blob) // Grava blob
DB.get(key)       // Lê blob
DB.clear()        // Limpa tudo
```

---

## 🗜️ Compressão de PDFs

**Objeto:** `PDF`  
**Função:** `PDF.compress(pdfBytes, onProgress)`

1. Carrega com `pdfjsLib.getDocument({ data: pdfBytes })`
2. Para cada página:
   - Renderiza em `<canvas>` com escala 1.2×
   - Exporta como JPEG, qualidade 60%
   - Adiciona ao novo PDF com `jsPDF`
   - Libera `canvas.width = 0` e chama `page.cleanup()` (evita OOM)
3. Chama `pdf.destroy()` ao final (libera worker)
4. Retorna `Uint8Array` do PDF comprimido

> ⚠️ Limitação: PDFs com texto vetorial perdem a seleção de texto após compressão.

---

## 💾 Constantes importantes (`Config`)

| Constante | Valor | Descrição |
|---|---|---|
| `SAFE_RAW_LIMIT` | 13MB | Limite real de divisão de ZIP (margem abaixo de 15MB) |
| `PDF_COMPRESS_THRESHOLD` | 5MB | Tamanho mínimo para acionar compressão de PDF |
| `STORAGE_KEY` | `org_alunos_categories_v1` | Chave no localStorage para categorias |

---

## 🛠️ Bibliotecas embutidas

| Biblioteca | Versão | Uso |
|---|---|---|
| JSZip | 3.10.1 | Criação e leitura de ZIPs |
| Tailwind CSS | 3.4.17 | Estilização via classes utilitárias |
| Lucide | latest | Ícones SVG |
| pdf.js | 2.16.105 | Leitura de PDFs no browser |
| jsPDF | 2.5.1 | Criação e exportação de PDFs |
| Inter | — | Tipografia embutida em base64 (offline) |
