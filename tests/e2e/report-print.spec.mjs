import { test, expect } from '@playwright/test';

const SAMPLE_LOG_CSV = [
  'Nome Completo;Hora;Contexto do Evento',
  'Ana Souza;2026-03-23 08:00:00;Matematica',
  'Ana Souza;2026-03-23 08:45:00;Matematica',
  'Bruno Lima;2026-03-23 09:00:00;Historia'
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__print_payload = '';
    window.__print_open_calls = 0;

    window.open = () => {
      window.__print_open_calls += 1;

      return {
        document: {
          _html: '',
          open() {},
          write(chunk) {
            this._html += String(chunk);
          },
          close() {
            window.__print_payload = this._html;
          }
        },
        addEventListener() {},
        focus() {},
        print() {},
        close() {}
      };
    };
  });
});

test('professional print output includes chart and full consolidated table', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => {
    return typeof window.ReportApp !== 'undefined' &&
      typeof window.ReportApp.handleFileUpload === 'function';
  });

  await page.evaluate((csvText) => {
    const fakeFile = { name: 'logs_moodle.csv' };
    window.ReportApp.handleFileUpload(fakeFile, csvText);
  }, SAMPLE_LOG_CSV);

  await expect(page.locator('#section-report')).not.toHaveClass(/hidden-section/);
  await expect(page.locator('#rpt-results-area')).not.toHaveClass(/hidden-section/);
  await expect(page.locator('#rpt-table-body tr')).toHaveCount(2);

  await page.click('#rpt-btn-print');

  const printMeta = await page.evaluate(() => ({
    calls: window.__print_open_calls,
    html: window.__print_payload
  }));

  expect(printMeta.calls).toBeGreaterThan(0);
  expect(printMeta.html).toContain('Relatório de Presenças Consolidadas');
  expect(printMeta.html).toContain('Distribuição por Curso');
  expect(printMeta.html).toContain('Presenças Consolidadas');
  expect(printMeta.html).toContain('Ana Souza');
  expect(printMeta.html).toContain('Bruno Lima');
});
