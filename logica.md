# 🧠 Lógica do Sistema — Organizador de Alunos

Documentação técnica do fluxo de processamento e das principais funções do `index.html`.

---

## 🔄 Fluxo geral

```
Seleção da Pasta
      ↓
processFiles() — identifica alunos e categoriza arquivos
      ↓
buildResultsUI() — renderiza lista de alunos na tela
      ↓
[Usuário clica em "Gerar"]
      ↓
openNomenclatureModal() — modal para editar nomes das pastas
      ↓
confirmNomenclatureAndGenerate()
      ↓
doGenerateZip() — comprime e gera o lote
      ↓
Download do ZIP mestre
```

---

## 📂 Identificação de Alunos

**Função:** `processFiles(files)`

- Recebe todos os arquivos selecionados
- Extrai o nome do aluno a partir do **primeiro nível de subpasta**
- Ignora arquivos de sistema: `.DS_Store`, `Thumbs.db`, `desktop.ini`, etc.
- Organiza os arquivos em `studentsData = { "Nome do Aluno": [arquivo1, arquivo2, ...] }`

---

## 🏷️ Categorização Automática

**Função:** `processFiles()` → `userCategories`

Cada arquivo é comparado com as **palavras-chave** de cada categoria:

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

As categorias são **editáveis** pelo modal e **salvas no `localStorage`**.

---

## 📦 Geração de ZIPs

**Função:** `doGenerateZip()`

### Passo 1 — Compressão condicional de PDFs

Se o total de bytes da pasta de um aluno **ultrapassar 13MB** (`SAFE_RAW_LIMIT`):
- Escaneia os arquivos em busca de PDFs maiores que **5MB**
- Aplica `compressPDF()` — renderiza cada página em canvas e reexporta como JPEG via jsPDF
- Substitui o arquivo original pelo comprimido na memória

### Passo 2 — Divisão em partes

**Função:** `buildCategoryOrderedZips(studentName, studentFiles)`

- Percorre as categorias **na ordem configurada**
- Adiciona arquivos categoria por categoria até o limite de **13MB bruto**
- Ao atingir o limite, **fecha o ZIP atual** e abre um novo:
  - `João da Silva.zip` → `João da Silva_parte2.zip` → ...
- Categorias cortadas no meio recebem sufixo `_parte2` na subpasta

### Passo 3 — ZIP Mestre

- Todos os ZIPs de todos os alunos são empacotados em um **ZIP mestre**
- Nome: `Lote_Alunos_YYYY-MM-DD.zip`
- Geração com compressão `DEFLATE` nível 3 (rápido, já que os arquivos internos já são ZIPs)

---

## 🗜️ Compressão de PDFs

**Função:** `compressPDF(pdfBytes, updateProgress)`

Usa `pdf.js` para ler o PDF e `jsPDF` para recriar:

1. Carrega o PDF com `pdfjsLib.getDocument()`
2. Para cada página:
   - Renderiza em um `<canvas>` com escala 1.2×
   - Exporta como JPEG com qualidade **60%** (`toDataURL('image/jpeg', 0.6)`)
   - Adiciona ao novo PDF com `jsPDF`
3. Retorna o `Uint8Array` do PDF comprimido

> ⚠️ Limitação: PDFs com texto vetorial perdem a seleção de texto após compressão.

---

## 💾 Constantes importantes

| Constante | Valor | Descrição |
|---|---|---|
| `MAX_ZIP_SIZE` | 15MB | Limite máximo declarado |
| `SAFE_RAW_LIMIT` | 13MB | Limite real usado no código (margem de segurança para compressão) |
| `STORAGE_KEY` | `org_alunos_categories_v1` | Chave no localStorage para salvar categorias |

---

## 🛠️ Bibliotecas embutidas

| Biblioteca | Versão | Uso |
|---|---|---|
| JSZip | 3.10.1 | Criação e leitura de ZIPs |
| Tailwind CSS | 3.4.17 | Estilização via classes utilitárias |
| Lucide | latest | Ícones SVG |
| pdf.js | 2.16.105 | Leitura de PDFs no browser |
| jsPDF | 2.5.1 | Criação e exportação de PDFs |
