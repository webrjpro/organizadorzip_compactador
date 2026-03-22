# 📦 Organizador Automático de Alunos

Ferramenta 100% offline para organizar e compactar documentos de alunos em ZIPs categorizados, prontos para envio no Educa (limite de 15MB por arquivo).

## 🚀 Como usar

1. Abra o `index.html` no navegador (Chrome ou Edge recomendado)
2. **Arraste a pasta mestre** (com subpastas por aluno) para a área de upload, ou clique para selecionar
3. Revise a lista de alunos e categorias detectadas automaticamente
4. Clique em **"Gerar e Descarregar Lote"**
5. O arquivo ZIP mestre será baixado automaticamente

## 📁 Estrutura esperada da pasta

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

## ⚙️ Funcionalidades

| Recurso | Descrição |
|---|---|
| 🗂️ Categorização automática | Detecta tipo de documento pelo nome do arquivo |
| ✏️ Edição de categorias | Adicionar, renomear e remover categorias em tempo real |
| 📏 Limite de 15MB | Divide automaticamente ZIPs que ultrapassem o limite |
| 🗜️ Compressão de PDFs | PDFs > 5MB são comprimidos via canvas/JPEG (pdf.js + jsPDF) |
| 💾 IndexedDB Swap | ZIPs intermediários gravados em disco virtual para evitar Out of Memory |
| 🔒 100% offline | Nenhum dado é enviado para servidores |
| 📱 PWA | Instalável como app via Service Worker |

## 🧩 Dependências

Todas embutidas diretamente no `index.html`:

- **JSZip** 3.10.1 — criação de arquivos ZIP
- **Tailwind CSS** 3.4.17 — estilização
- **Lucide Icons** — ícones SVG
- **pdf.js** 2.16 + **jsPDF** 2.5.1 — leitura e compressão de PDFs
- **Inter** (Google Fonts) — tipografia *(embutida offline em base64)*

## 📋 Requisitos

- Navegador moderno: **Chrome 86+**, **Edge 86+** ou **Firefox 111+**
- Suporte a **File System Access API** para arrastar pastas (Chrome/Edge)
- Sem necessidade de internet — fontes e dependências embutidas no HTML

## 🗂️ Arquivos do projeto

| Arquivo | Descrição |
|---|---|
| `index.html` | Aplicação completa (HTML + CSS + JS embutidos) |
| `manifest.json` | Manifest do PWA |
| `sw.js` | Service Worker para cache offline |
| `icon-192.jpeg` / `icon-512.jpeg` | Ícones do PWA |
| `app_only.js` | Código JS isolado (referência de desenvolvimento) |
| `apply_idb.js` | Script Node.js — patch do IndexedDB swap |
| `fix_inputs.js` | Script Node.js — patch de estilos dos inputs |
| `fix_oom.js` | Script Node.js — patch de gestão de memória |
| `fix_qa_bugs.js` | Script Node.js — patch de bugs QA (removeCategory, etc.) |
