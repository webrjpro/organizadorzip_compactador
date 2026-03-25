# Changelog

Todas as alterações notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [1.0.0] — 2026-02-20

### Primeira versão de produção

### Adicionado
- **Interface gráfica** dark theme completa (tkinter + ttk clam)
  - 3 abas: Compactar, Descompactar, Sobre
  - Barra de progresso em tempo real com estatísticas detalhadas
  - Log de operação com scroll automático
  - Janela 750×750 centralizada, redimensionável (mín. 650×650)
- **Motor de compactação multi-thread** (`Zipador`)
  - ThreadPoolExecutor para arquivos ≤ 100 MB
  - Escrita sequencial para arquivos > 100 MB
  - Níveis de compressão 0–9 (ZIP_DEFLATED)
  - Suporte ZIP64 para arquivos > 4 GB
- **Motor de descompactação multi-thread** (`Deszipador`)
  - Estratégia batch-per-thread (1 abertura de ZIP por thread)
  - Streaming por chunks de 8 MB (RAM constante)
- **Modo Turbo** (⚡)
  - Compactação: nível 1 + max(CPU×2, 16) threads
  - Descompactação: max(CPU×2, 16) threads
  - Toggle via checkboxes com destaque laranja
- **Suporte a caminhos longos** (>260 caracteres)
  - Prefixo `\\?\` automático no Windows
  - Aviso ao criar ZIP com caminhos longos
- **Internacionalização (i18n)** — 3 idiomas
  - Português (Brasil) 🇧🇷
  - English 🇺🇸
  - Español 🇪🇸
  - Seleção por bandeiras clicáveis desenhadas em Canvas
  - Persistência de preferência em `.zipador_prefs.json`
  - Troca instantânea sem reiniciar
- **Proteção de propriedade intelectual**
  - Licenciamento por HWID (SHA-256 de MAC + CPU + disco + máquina)
  - Verificação anti-tampering de executável PyInstaller
  - Checksum de integridade no arquivo de licença
  - Watermark de copyright no comentário do ZIP
  - Cabeçalho de copyright multilíngue (PT-BR + EN)
- **Instalador profissional** (Inno Setup 6)
  - EULA obrigatório (199 linhas, Lei 9.609/98 e 9.610/98)
  - 3 idiomas no wizard
  - Atalhos: Menu Iniciar, Desktop, Barra de Tarefas
  - Menu de contexto do Windows (botão direito)
  - Registro do Windows com metadados
  - Detecção de versão anterior + desinstalação automática
  - Compressão LZMA2/ultra64
- **Aba Sobre/Licença** com:
  - Informações do desenvolvedor
  - HWID da máquina
  - Aviso legal completo

### Segurança (Fixes de Hardening)
- **FIX 1**: Proteção contra Path Traversal — `_nome_seguro()` remove `../` e 
  `_validar_caminho_seguro()` garante que arquivos não escapam do diretório destino
- **FIX 2**: Limpeza automática de ZIP parcial — `_cleanup_zip_parcial()` remove 
  arquivo corrompido quando compactação falha, é cancelada ou lança exceção
- **FIX 3**: Rate-limiting de log — sistema batch com flush a cada 50ms máximo + 
  limite de 5000 linhas no widget, evitando travamento da GUI com milhares de callbacks
- **FIX 4**: Documentação de thread-safety — cada thread abre seu próprio ZipFile 
  (documentado nos docstrings de `_extrair_membro_direto` e `_processar_lote`)
- **FIX 5**: Sanitização de nomes Windows — remoção de caracteres proibidos 
  (`<>:"|?*`), caracteres de controle (0x00–0x1F) e trailing dots/spaces

### Otimização
- Streaming por chunks de 8 MB em vez de `zf.read()` completo
  (suporta arquivos de 1 GB+ sem estourar RAM)
- Batch-per-thread na descompactação (1 abertura ZIP por thread)
- Thread daemon para operações não bloquearem a GUI
- Callbacks via `janela.after()` para thread-safety do tkinter

### Testado
- 23/23 testes unitários passando (path traversal, sanitização, cleanup)
- Verificação SHA-256 de integridade com arquivo de 200 MB
- Validação de sintaxe via `py_compile`
- Build PyInstaller 6.19.0 sem warnings
- Build Inno Setup 6.6.1 sem erros

---

## [0.x.x] — Desenvolvimento

Versões de desenvolvimento interno, não distribuídas:
- v0.1: Script básico de compactação ZIP (CLI)
- v0.2: Interface gráfica tkinter inicial
- v0.3: Conversão para .pyw (sem terminal)
- v0.4: Empacotamento PyInstaller
- v0.5: Instalador Inno Setup
- v0.6: Sistema de proteção HWID
- v0.7: Internacionalização (3 idiomas)
- v0.8: Modo Turbo + otimização de threads
- v0.9: Streaming 8 MB + suporte a 1 GB+
- v0.10: Auditoria de segurança + 5 fixes

---

**Copyright (C) 2026 Carlos Antonio de Oliveira Piquet — Piquet Software**
