# 🧠 Lógica do Sistema — Organizador Automático de Alunos

Documentação técnica da arquitetura e fluxo de processamento do `index.html` (v3.0 — SPA unificado).

---

## 🏗️ Arquitetura Geral

O sistema é composto de **três módulos independentes** integrados em um único `index.html`, com uma camada de detecção automática que roteia o arquivo para o módulo correto:

```
Drop Zone (pasta ou arquivo)
        │
        ├─── 📁 Pasta ────────────────────► Módulo 1: Organizador de Pastas
        │
        └─── 📄 Arquivo ──► detectCsvType()
                                │
                                ├─── Excel (.xlsx/.xls) ──────────────► Módulo 2: CsvApp
                                ├─── CSV de alunos (matrícula/turma) ─► Módulo 2: CsvApp
                                └─── CSV de logs (hora/evento) ───────► Módulo 3: ReportApp
```

---

## 🔀 Camada de Roteamento Inteligente

### `handleSmartCsvUpload(file)`
Dispatcher central para arquivos de planilha/CSV:
1. Extensão `.zip` → toast de aviso (use a área de pasta)
2. Extensão `.xlsx`/`.xls` → `CsvApp.handleFileUpload(file)`
3. Extensão `.csv` → lê os cabeçalhos → `detectCsvType(headers)` → roteia

### `detectCsvType(headers)`
Analisa os cabeçalhos do CSV e retorna `'log'` ou `'alunos'`:

| Sinal de LOG (score +1 cada) | Sinal de ALUNO |
|---|---|
| hora, contexto, componente | matricula, turma |
| nome do evento, evento | cpf, data de nascimento |
| descricao, origem, endereco ip | sexo, nome mae, celular |

- Score de log ≥ 2 e > score de aluno → `'log'`
- Presença de `'hora'` ou `'evento'` isolados → `'log'`
- Default → `'alunos'`

---

## 📦 Módulo 1 — Organizador de Pastas

### Fluxo

```
Seleção da Pasta (clique ou drag & drop)
      ↓
Files.process() — identifica alunos e categoriza arquivos
      ↓
UI.buildResultsUI() — renderiza lista de alunos na tela
      ↓
[Usuário clica em "Gerar"]
      ↓
Categories.openModal() — modal para editar nomes/palavras-chave
      ↓
Categories.confirmAndGenerate()
  └─ Re-categoriza todos os arquivos com as categorias atualizadas
  └─ UI.buildResultsUI() — atualiza a UI
  └─ ZIP.generate()
      ↓
Download do ZIP mestre (Lote_Alunos_YYYY-MM-DD.zip)
```

### Identificação de Alunos (`Files`)
- Extrai o nome do aluno a partir do **segundo nível de pasta** (`partes[1]`)
- Ignora arquivos de sistema: `.DS_Store`, `Thumbs.db`, `desktop.ini`
- Organiza: `State.studentsData = { "Nome do Aluno": [{file, catName, originalName}] }`
- Suporta **drag & drop via File System Access API** (`Files.readDirRecursive`)

### Categorização Automática (`Categories`)

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
| PDF Não encontrado | *(fallback — tudo que não se encaixou)* |

### Geração de ZIPs (`ZIP`)

**Passo 1 — IndexedDB Swap**
```js
await DB.init();   // 'EduVault_Swap' objectStore 'swap'
await DB.clear();  // Garante espaço limpo
```

**Passo 2 — Compressão condicional de PDFs**
- Se `totalStudentSize > Config.SAFE_RAW_LIMIT` (13MB):
  - PDFs > `Config.PDF_COMPRESS_THRESHOLD` (5MB) são comprimidos
  - Renderiza em `<canvas>`, exporta JPEG qualidade 60% com jsPDF

**Passo 3 — ZIPs por aluno**
- Percorre categorias na ordem configurada
- Limita a 13MB bruto por ZIP → `_parte2`, `_parte3`...
- `compression: 'STORE'` (rápido, sem double-compress)
- Grava blobs no IndexedDB via `DB.put(zipName, blob)`
- Libera `item.file = null` após cada aluno (evita OOM)

**Passo 4 — ZIP Mestre**
- Lê blobs do IndexedDB → empacota → download automático
- Nome: `Lote_Alunos_YYYY-MM-DD.zip`

---

## 📊 Módulo 2 — Conversor Moodle CSV (`CsvApp`)

Converte planilhas Excel/CSV de alunos para o formato de importação do Moodle.

### Fluxo
```
handleFileUpload(file)
      ↓
CsvFileProcessor.process() — lê Excel ou CSV via SheetJS
      ↓
Detecção automática de colunas (nome, email, matrícula, turma)
      ↓
Preview da transformação na seção #section-csv
      ↓
Download do CSV transformado (UTF-8 com BOM)
```

### Componentes
- `CsvApp` — controlador principal, gerencia UI e eventos
- `CsvFileProcessor` — processa o arquivo, detecta colunas, transforma dados
- `handleFileUpload(file)` — entry point público chamado pelo dispatcher

---

## 📈 Módulo 3 — Relatório de Visualizações (`ReportApp`)

Analisa CSVs de logs do Moodle para gerar relatório de presenças únicas por aluno/dia.

### Fluxo
```
handleFileUpload(file, text)
      ↓
parseCSV() — detecta delimitador (vírgula ou ponto-e-vírgula)
      ↓
populateSelect() — preenche seletores de coluna (Aluno, Data, Curso)
guessColumn() — auto-detecta colunas pelo nome
      ↓
generateReport()
  └─ preFiltered — aplica filtro de data e exclusões
  └─ groups → deduplicação por (aluno + data normalizada)
  └─ coursesCount → contagem de acessos por curso
      ↓
renderResults()
  └─ KPIs: presenças únicas, alunos distintos
  └─ Gráfico de barras por curso
  └─ Tabela paginada (50 itens/pág) com busca inline
      ↓
Exportar CSV / Imprimir
```

### Deduplicação
Cada combinação única `(aluno + data)` conta como **1 presença**, independente de quantas
linhas de log existam para esse par. Cursos do dia são concatenados com ` · `.

### Normalização de Datas
Suporta todos os formatos do Moodle:
- `23/03/2026, 13:02:45` → `23/03/2026`
- `2026-03-23T13:02:00` → `2026-03-23`
- `23/03/2026 13:02` → `23/03/2026`

---

## 💾 IndexedDB Swap (`DB`)

Evita Out of Memory em lotes grandes:

```js
DB.init()        // Abre/cria 'EduVault_Swap' → objectStore 'swap'
DB.put(key, blob) // Grava blob
DB.get(key)       // Lê blob
DB.clear()        // Limpa tudo
```

---

## 🗜️ Compressão de PDFs (`PDF`)

1. Carrega com `pdfjsLib.getDocument({ data: pdfBytes })`
2. Para cada página: renderiza em `<canvas>` escala 1.2×, exporta JPEG 60%
3. Adiciona ao novo PDF com `jsPDF`, libera `canvas.width = 0`
4. Chama `pdf.destroy()` ao final (libera worker)
5. Retorna `Uint8Array` do PDF comprimido

> ⚠️ PDFs com texto vetorial perdem seleção de texto após compressão.

---

## 🔧 Constantes (`Config`)

| Constante | Valor | Descrição |
|---|---|---|
| `SAFE_RAW_LIMIT` | 13MB | Limite real de divisão de ZIP |
| `PDF_COMPRESS_THRESHOLD` | 5MB | Tamanho mínimo para acionar compressão |
| `STORAGE_KEY` | `org_alunos_categories_v1` | Chave localStorage para categorias |

---

## 🛠️ Bibliotecas integradas

| Biblioteca | Versão | Módulo | Uso |
|---|---|---|---|
| JSZip | 3.10.1 | Organizador | Criação e leitura de ZIPs |
| Tailwind CSS | 3.4.17 | Global | Estilização |
| Lucide | latest | Global | Ícones SVG |
| pdf.js | 2.16.105 | Organizador | Leitura de PDFs |
| jsPDF | 2.5.1 | Organizador | Exportação de PDFs |
| SheetJS (xlsx) | latest | CsvApp | Leitura de Excel |
| Inter | — | Global | Tipografia embutida offline |

---

## 🐛 Bugs Corrigidos

### v2.0
| # | Bug | Solução |
|---|---|---|
| 1 | `ReportApp.init()` fora do `DOMContentLoaded` | Movido após listener, com try/catch guard |
| 2 | ZIP arrastado para o input de planilha sem feedback | Guard + toast explicativo |
| 3 | Extensão desconhecida silenciosa | Toast com nome da extensão |
| 4 | `detectCsvType` falso-positivo em notas de alunos | Heurística melhorada com pesos |
| 5 | `ReportApp.init()` sem guard de DOM | Verificação do elemento antes de inicializar |
| 6 | `lucide.createIcons()` pode quebrar offline | Envolvido em try/catch |

### v3.0 — Consolidação SPA (relatorio.html + csv.html → index.html)
| # | Bug | Solução |
|---|---|---|
| 7 | `'use strict'` duplicado + constantes `IGNORED_FILES`/`COLOR_PALETTE` declaradas em escopo global errôneo | Bloco legado removido — constantes já vivem dentro de `Config` |
| 8 | Listener de `<select>` do ReportApp vinculado a `.rpt-config-input` (classe inexistente) | Corrigido para `#section-report .config-input` |
| 9 | `renderTable()` chamado dentro do `btnPrint` (função não existe) | Substituído por `renderResults()` (nome real da função) |
| 10 | `doc.autoTable()` exige plugin `jspdf-autotable` (não carregado) — relatório PDF nunca gerava | Substituído por geração de relatório HTML nativo + download + `window.print()` automático |

