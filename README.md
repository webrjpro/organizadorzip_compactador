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
| 📏 Limite de 15MB | Divide automaticamente se necessário |
| 🗜️ Compressão de PDFs | PDFs > 5MB são comprimidos automaticamente |
| 🔒 100% offline | Nenhum dado é enviado para servidores |
| ✏️ Edição de categorias | Nomes de pasta configuráveis em tempo real |

## 🧩 Dependências

Todas embutidas diretamente no `index.html`:

- **JSZip** 3.10.1 — criação de arquivos ZIP
- **Tailwind CSS** 3.4.17 — estilização
- **Lucide Icons** — ícones
- **pdf.js** 2.16 + **jsPDF** 2.5.1 — leitura e compressão de PDFs
- **Inter** (Google Fonts) — tipografia *(requer internet apenas para a fonte)*

## 📋 Requisitos

- Navegador moderno: **Chrome 86+**, **Edge 86+** ou **Firefox 111+**
- Suporte a **File System Access API** para arrastar pastas (Chrome/Edge)
- Conexão com internet apenas para carregar a fonte Inter (opcional)
