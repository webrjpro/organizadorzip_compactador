# 📦 Organizador Automático de Alunos

Ferramenta com três módulos integrados, usando `index.html` como shell e código em módulos físicos:

1. **Organizador de Pastas** — organiza documentos em ZIPs por aluno (limite 15MB/arquivo)
2. **Conversor Moodle CSV** — converte planilhas Excel/CSV de alunos para o formato do Moodle
3. **Relatório de Visualizações** — analisa logs CSV do Moodle para gerar presenças únicas

O sistema detecta automaticamente o tipo de arquivo arrastado e abre o módulo correto.

## 🚀 Como usar

### Módulo 1 — Organizador de Pastas
1. **Arraste a pasta mestre** (com subpastas por aluno) para a área de upload central
2. Revise a lista de alunos e categorias detectadas automaticamente
3. Clique em **"Gerar e Descarregar Lote"**
4. O ZIP mestre será baixado automaticamente

### Módulo 2 — Conversor Moodle CSV
1. **Arraste um arquivo Excel (`.xlsx`) ou CSV de alunos** (com colunas: nome, matrícula, turma)
2. O sistema detecta automaticamente e abre o conversor
3. Configure os mapeamentos de coluna e exporte no formato Moodle

### Módulo 3 — Relatório de Visualizações
1. **Arraste um CSV de logs do Moodle** (com colunas: hora, usuário, evento)
2. O sistema detecta automaticamente e abre o módulo de relatório
3. Configure filtros de data e alunos excluídos, exporte ou imprima

---

## 🧠 Detecção Automática de Tipo de Arquivo

| Arquivo arrastado/selecionado | Módulo ativado |
|---|---|
| 📁 **Pasta** | Organizador de Pastas |
| 📊 **Excel** (`.xlsx`, `.xls`) | Conversor Moodle CSV |
| 📄 **CSV de alunos** (tem: matrícula, turma, CPF) | Conversor Moodle CSV |
| 📄 **CSV de logs** (tem: hora, evento, contexto) | Relatório de Visualizações |

---

## 📁 Estrutura esperada da pasta (Módulo 1)

```
Pasta_Mestre/
├── João da Silva/
│   ├── rg_joao.pdf
│   ├── diploma_joao.pdf
│   └── atestado_joao.pdf
├── Maria Souza/
│   ├── cpf_maria.pdf
│   └── formulario_maria.pdf
└── ...
```

---

## ⚙️ Funcionalidades

| Recurso | Descrição |
|---|---|
| 🎯 Drop Zone inteligente | Detecta automaticamente o tipo de arquivo |
| 🗂️ Categorização automática | Detecta tipo de documento pelo nome do arquivo |
| ✏️ Edição de categorias | Adicionar, renomear e remover categorias em tempo real |
| 📏 Limite de 15MB | Divide automaticamente ZIPs que ultrapassem o limite |
| 🗜️ Compressão de PDFs | PDFs > 5MB comprimidos via canvas/JPEG |
| 💾 IndexedDB Swap | ZIPs intermediários em disco virtual (evita Out of Memory) |
| 🔄 Conversor Moodle | Planilhas Excel/CSV → formato CSV do Moodle |
| 📊 Relatório de Logs | Análise de presenças únicas por aluno/dia com gráfico |
| 🔒 100% offline | Nenhum dado enviado para servidores |
| 📱 PWA | Instalável como app via Service Worker |

---

## 🧩 Dependências

Todas embutidas diretamente no `index.html`:

- **JSZip** 3.10.1 — criação de arquivos ZIP
- **Tailwind CSS** 3.4.17 — estilização
- **Lucide Icons** — ícones SVG
- **pdf.js** 2.16 + **jsPDF** 2.5.1 — leitura e compressão de PDFs
- **SheetJS (xlsx)** — leitura de arquivos Excel
- **Inter** (Google Fonts) — tipografia *(embutida offline em base64)*

---

## 📋 Requisitos

- Navegador moderno: **Chrome 86+**, **Edge 86+** ou **Firefox 111+**
- Suporte a **File System Access API** para arrastar pastas (Chrome/Edge)
- Sem necessidade de internet — fontes e dependências embutidas no HTML

---

## 🗂️ Arquivos do projeto

| Arquivo | Descrição |
|---|---|
| `index.html` | Shell principal da aplicação (layout + carregamento dos módulos) |
| `src/core/app-core.js` | Núcleo da aplicação (estado, actions, upload, roteamento) |
| `src/tools/csv/csv-app.js` | Módulo Conversor Moodle CSV |
| `src/tools/report/report-app.js` | Módulo Relatório de Visualizações |
| `manifest.json` | Manifest do PWA |
| `sw.js` | Service Worker para cache offline |
| `icon-192.jpeg` / `icon-512.jpeg` | Ícones do PWA |
| `package.json` | Scripts de qualidade (`test:smoke`, `test:e2e`, `ci`) |
| `playwright.config.mjs` | Configuração de testes E2E |
| `tests/` | Testes smoke e E2E |
| `.github/workflows/ci.yml` | Pipeline de CI |
| `logica.md` | Documentação técnica detalhada da arquitetura |
| `ARCHITECTURE.md` | Guia de arquitetura e expansão de ferramentas |
| `LICENSE.md` | Licença de software proprietário |

---

## 🔐 Privacidade

Todo o processamento ocorre **localmente no navegador**. Nenhum dado de aluno, documento ou CSV é enviado para qualquer servidor externo.
