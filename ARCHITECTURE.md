# Arquitetura (Produção)

## Princípios
- Estado centralizado em `State`.
- Configuração imutável em `Config`.
- DOM centralizado em `DOM.init()`.
- Eventos de UI por delegação com `ActionBus` (`data-action`).
- Roteamento de entrada de arquivos via `ToolRouter`.
- Observabilidade com `Logger`.
- Tratamento global de falhas com `ErrorMonitor`.

## Fluxo de Inicialização
1. `DOMContentLoaded`
2. `App.init()`
3. `CsvApp.init()`
4. `ReportApp.init()`

`App.init()` é idempotente (não executa duas vezes).

## Estrutura Física de Módulos
- Núcleo:
  - `src/core/app-core.js`
- Ferramentas:
  - `src/tools/report/report-app.js`
  - `src/tools/csv/csv-app.js`

A página `index.html` apenas referencia os módulos, mantendo ordem de carga previsível.

## Como adicionar nova ferramenta
1. Criar módulo da ferramenta com API mínima:
   - `init()`
   - `handleFileUpload(file, text?)`
2. Registrar regra de roteamento no `ToolRouter`:
   - extensão suportada
   - detector (quando necessário)
   - handler da ferramenta
3. Criar seção própria no HTML (`section-...`) com IDs prefixados.
4. Evitar `onclick` inline; usar `data-action` + `ActionBus`.

## Regras de Produção
- Não acessar elementos diretamente fora de `DOM` quando possível.
- Não criar novos globais sem necessidade.
- Tratar erros com `try/catch` e `Logger`.
- Mensagens para usuário via `UI.toast`.
- IDs novos devem ser namespaced para evitar colisões.

## Qualidade e CI
- Smoke tests: `tests/smoke/modularization.smoke.test.mjs`
- E2E tests: `tests/e2e/report-print.spec.mjs`
- Config Playwright: `playwright.config.mjs`
- Pipeline CI: `.github/workflows/ci.yml`

Comandos:
1. `npm install`
2. `npm run test:smoke`
3. `npm run test:e2e`
