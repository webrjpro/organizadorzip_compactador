# ⚡ Zipador de Alta Performance

> Compactador e Descompactador ZIP profissional para Windows, com GUI moderna,
> multi-threading, proteção por HWID e suporte a caminhos longos.

[![Version](https://img.shields.io/badge/version-1.0.0-7c3aed?style=flat-square)]()
[![Python](https://img.shields.io/badge/python-3.10+-3776ab?style=flat-square)]()
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078d4?style=flat-square)]()
[![License](https://img.shields.io/badge/license-Propriet%C3%A1rio-ef4444?style=flat-square)]()

---

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Screenshots](#-screenshots)
- [Arquitetura](#-arquitetura)
- [Estrutura de Arquivos](#-estrutura-de-arquivos)
- [Requisitos](#-requisitos)
- [Build](#-build)
- [Instalação](#-instalação)
- [Segurança](#-segurança)
- [Internacionalização](#-internacionalização)
- [Desempenho](#-desempenho)
- [Limitações Conhecidas](#-limitações-conhecidas)
- [Licença e Direitos Autorais](#-licença-e-direitos-autorais)
- [Contato](#-contato)

---

## 🎯 Visão Geral

O **Zipador de Alta Performance** é um software desktop nativo para Windows que compacta
e descompacta arquivos ZIP com interface gráfica moderna dark theme, operação
multi-threaded e suporte a caminhos acima de 260 caracteres.

Desenvolvido inteiramente em Python com tkinter, sem dependências externas,
empacotado como executável standalone via PyInstaller e distribuído com
instalador profissional Inno Setup.

---

## ✨ Funcionalidades

### Compactação
- Compressão ZIP_DEFLATED com nível ajustável (0–9)
- Multi-threading: arquivos ≤ 100 MB comprimidos em paralelo
- Arquivos > 100 MB escritos sequencialmente (sem estourar RAM)
- Modo Turbo: compressão nível 1 + dobro de threads
- Watermark de copyright embarcado no comentário do ZIP
- Suporte ZIP64 para arquivos > 4 GB
- Detecção e aviso de caminhos longos (>260 chars)

### Descompactação
- Multi-threading com estratégia batch-per-thread
- Streaming por chunks de 8 MB (suporta arquivos de qualquer tamanho)
- Modo Turbo: máximo de threads para extração ultrarrápida
- Proteção contra ZIP malicioso (Path Traversal)
- Sanitização de nomes de arquivo para Windows

### Interface
- Dark theme (paleta Catppuccin Mocha + roxo/verde)
- 3 abas: Compactar, Descompactar, Sobre
- Barra de progresso em tempo real com estatísticas
- Log de operação rate-limited (sem travamento da GUI)
- Internacionalização: PT-BR 🇧🇷, English 🇺🇸, Español 🇪🇸
- Troca de idioma instantânea por bandeiras clicáveis
- Arquivo `.pyw`: abre sem janela do CMD

### Proteção IP
- Licenciamento vinculado ao HWID (Hardware ID) da máquina
- Verificação anti-tampering do executável PyInstaller
- Checksum do arquivo de licença contra adulteração
- Watermark de copyright no ZIP
- EULA completo no instalador (Lei 9.609/98 e 9.610/98)

### Instalador
- Inno Setup 6 com wizard moderno e 3 idiomas
- EULA obrigatório antes da instalação
- Atalhos: Menu Iniciar, Área de Trabalho, Barra de Tarefas
- Menu de contexto: "Compactar com Zipador" / "Descompactar com Zipador"
- Registro do Windows com metadados do app
- Detecção de versão anterior + desinstalação automática
- Não requer privilégio de administrador

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────────────┐
│                   zipador.pyw                     │
│                  (~2050 linhas)                    │
├──────────────┬───────────────┬────────────────────┤
│  PROTEÇÃO    │   MOTORES     │       GUI          │
│              │               │                    │
│ Protecao     │  Zipador      │  iniciar_gui()     │
│ Software     │  (compress)   │  ├─ Aba Compactar  │
│ ├─ HWID      │  ├─ parallel  │  ├─ Aba Descomp.   │
│ ├─ Licença   │  ├─ streaming │  ├─ Aba Sobre      │
│ ├─ Anti-     │  └─ ZIP64     │  ├─ Bandeiras i18n │
│ │  tamper    │               │  ├─ Modo Turbo     │
│ └─ Watermark │  Deszipador   │  └─ Log rate-limit │
│              │  (decompress) │                    │
│              │  ├─ batch/    │                    │
│              │  │  thread    │                    │
│              │  ├─ chunks    │                    │
│              │  └─ security  │                    │
├──────────────┴───────────────┴────────────────────┤
│  SEGURANÇA: _nome_seguro() + _validar_caminho()   │
│  I18N: TRADUCOES dict × 3 idiomas                  │
│  FORMATO: formatar_tamanho() + formatar_tempo()    │
│  CAMINHOS: caminho_longo() / caminho_curto()       │
└──────────────────────────────────────────────────┘
```

### Fluxo de Compactação
```
Usuário seleciona pasta/arquivo
  → escanear_diretorio() → lista de (caminho, relativo, tamanho)
  → Separar: pequenos (≤100MB) / grandes (>100MB)
  → Pequenos: ThreadPoolExecutor → comprimir_arquivo_mem() → writestr()
  → Grandes: zf.write() sequencial
  → Watermark no ZIP comment
  → Resultado com estatísticas
```

### Fluxo de Descompactação
```
Usuário seleciona ZIP
  → ZipFile.infolist() → separar membros
  → Diretórios criados primeiro
  → Pequenos (≤50MB): distribuir em lotes → 1 thread/lote → cada thread abre ZIP 1x
  → Grandes (>50MB): extração sequencial com chunks de 8MB
  → Cada membro: _nome_seguro() → _validar_caminho_seguro() → streaming write
  → Resultado com estatísticas
```

---

## 📁 Estrutura de Arquivos

```
zipadorpiquet/
├── zipador.pyw          # Código-fonte principal (GUI + motores + proteção)
├── zipador.ico          # Ícone multi-resolução do aplicativo
├── LICENCA.txt          # EULA completo em português (199 linhas)
├── version_info.txt     # Metadados de versão para PyInstaller
├── instalador.iss       # Script Inno Setup do instalador
├── wizard_large.bmp     # Imagem lateral do wizard (164×314 px)
├── wizard_small.bmp     # Ícone do wizard (55×55 px)
├── Zipador.exe          # Executável compilado (PyInstaller)
├── Zipador.spec         # Spec gerado pelo PyInstaller
├── README.md            # Este arquivo
├── CHANGELOG.md         # Histórico de alterações
├── dist/                # Saída do PyInstaller
│   └── Zipador.exe
├── build/               # Cache temporário do PyInstaller
├── instalador/          # Saída do Inno Setup
│   └── Zipador_Setup_1.0.0.exe
└── .venv/               # Ambiente virtual Python (dev)
```

---

## 📋 Requisitos

### Para Uso
- Windows 10 ou 11 (64-bit)
- Nenhuma dependência adicional (executável standalone)

### Para Desenvolvimento
- Python 3.10+ (testado em 3.13.6)
- Bibliotecas: **apenas stdlib** (tkinter, zipfile, hashlib, uuid, etc.)
- PyInstaller 6.19.0+ (empacotamento)
- Inno Setup 6.6.1+ (instalador)

---

## 🔨 Build

### 1. Compilar Executável

```powershell
python -m PyInstaller `
    --onefile `
    --windowed `
    --name "Zipador" `
    --icon "zipador.ico" `
    --version-file "version_info.txt" `
    --clean `
    zipador.pyw
```

O executável será gerado em `dist/Zipador.exe`.

### 2. Gerar Instalador

```powershell
# Copiar exe para raiz (Inno Setup espera aqui)
Copy-Item dist\Zipador.exe .\Zipador.exe -Force

# Compilar instalador
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "instalador.iss"
```

O instalador será gerado em `instalador/Zipador_Setup_1.0.0.exe`.

### 3. Executar em Desenvolvimento

```powershell
# Direto com Python (sem compilar)
python zipador.pyw

# Ou duplo-clique no arquivo .pyw (usa pythonw.exe, sem terminal)
```

---

## 📦 Instalação

1. Execute `Zipador_Setup_1.0.0.exe`
2. Aceite o EULA (Contrato de Licença)
3. Escolha o diretório de instalação
4. Selecione as opções desejadas:
   - ✅ Atalho na Área de Trabalho
   - ✅ Atalho na Barra de Tarefas
   - ✅ Menu de contexto (botão direito)
5. Clique em "Instalar"

### Desinstalação
- Painel de Controle → Programas → Zipador → Desinstalar
- Ou via Menu Iniciar → Zipador → Desinstalar

---

## 🔒 Segurança

### Proteção contra ZIP Malicioso (v1.0.0)
| Vetor de Ataque | Proteção Implementada |
|---|---|
| Path Traversal (`../../etc/passwd`) | `_nome_seguro()` remove componentes `..` |
| Escape do diretório destino | `_validar_caminho_seguro()` verifica containment |
| Caracteres proibidos Windows (`<>:"\|?*`) | Sanitização em `_nome_seguro()` |
| Caracteres de controle (0x00–0x1F) | Removidos na sanitização |
| Trailing dots/spaces em nomes | Removidos (Windows ignora mas causa bugs) |
| ZIP parcial corrompido após falha | `_cleanup_zip_parcial()` remove automaticamente |
| Flood de callbacks travando GUI | Rate-limit com batch flush a cada 50ms |
| Arquivos grandes estourando RAM | Streaming por chunks de 8 MB |

### Proteção de Propriedade Intelectual
- **HWID Licensing**: licença vinculada ao hardware via SHA-256 de MAC + CPU + disco
- **Anti-Tampering**: verificação do bootloader PyInstaller no executável
- **Checksum**: arquivo de licença com integridade verificada
- **Watermark**: copyright embarcado em todo ZIP criado
- **EULA**: contrato exibido no instalador (Lei 9.609/98)

---

## 🌐 Internacionalização

O sistema suporta 3 idiomas com troca instantânea:

| Idioma | Código | Seleção |
|---|---|---|
| Português (Brasil) | `pt-br` | 🇧🇷 Bandeira clicável |
| English | `en` | 🇺🇸 Bandeira clicável |
| Español | `es` | 🇪🇸 Bandeira clicável |

- 59 chaves de tradução por idioma
- Preferência salva em `%LOCALAPPDATA%\PiquetSoftware\Zipador\.zipador_prefs.json`
- Aba "Sobre" reconstruída inteiramente ao trocar idioma
- Instalador também suporta os 3 idiomas

---

## ⚡ Desempenho

### Estratégia de Threading

| Cenário | Estratégia | Motivo |
|---|---|---|
| Compactação ≤ 100 MB/arquivo | ThreadPoolExecutor paralelo | Leitura + compressão em paralelo |
| Compactação > 100 MB/arquivo | Sequencial com `zf.write()` | Evita estouro de RAM |
| Descompactação ≤ 50 MB/arquivo | Batch-per-thread (1 ZIP open/thread) | Reduz overhead de I/O |
| Descompactação > 50 MB/arquivo | Sequencial com chunks 8 MB | RAM constante ~8 MB |

### Modo Turbo
- **Compactação**: nível 1 (mínimo) + `max(CPU×2, 16)` threads
- **Descompactação**: `max(CPU×2, 16)` threads

---

## ⚠️ Limitações Conhecidas

1. **Formato**: apenas ZIP (não suporta 7z, RAR, tar.gz)
2. **Criptografia**: não suporta ZIP com senha
3. **Symlinks**: ignorados durante escaneamento (segurança)
4. **Plataforma**: Windows 10+ apenas (usa APIs Win32 para caminhos longos)
5. **Licença**: vinculada ao hardware — troca de componentes pode invalidar

---

## ⚖️ Licença e Direitos Autorais

```
Copyright (C) 2026 Carlos Antonio de Oliveira Piquet
Todos os direitos reservados.

Este software é propriedade exclusiva do autor.
É PROIBIDO copiar, modificar, redistribuir, descompilar
ou fazer engenharia reversa sem autorização prévia
e por escrito do autor.

Protegido pela Lei nº 9.609/98 (Lei do Software)
e Lei nº 9.610/98 (Lei de Direitos Autorais) do Brasil.
```

Consulte [LICENCA.txt](LICENCA.txt) para o contrato completo (EULA).

---

## 📬 Contato

| | |
|---|---|
| **Desenvolvedor** | Carlos Antonio de Oliveira Piquet |
| **Email** | carlospiquet.projetos@gmail.com |
| **Publisher** | Piquet Software |

---

<p align="center">
  <em>⚡ Zipador de Alta Performance v1.0.0 — © 2026 Piquet Software</em>
</p>
