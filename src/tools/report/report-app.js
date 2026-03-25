
// ══════════════════════════════════════════════════════════════
// REPORT APP — Análise de Visualizações do Moodle
// ══════════════════════════════════════════════════════════════
const ReportApp = (() => {
    'use strict';

    let PAGE_SIZE = 50;
    const DEBOUNCE_MS = 280;
    const PRINT_CHART_LIMIT = 12;

    let state = {
        rawData: [],
        headers: [],
        report: null,
        searchQuery: '',
        currentPage: 1
    };

    const $ = (id) => document.getElementById(id);
    let el = {};

    function debounce(fn, ms) {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }

    function animateCounter(el, targetValue) {
        const start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
        const diff = targetValue - start;
        const duration = 500;
        const startTime = performance.now();
        (function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(start + diff * eased).toLocaleString('pt-BR');
            if (progress < 1) requestAnimationFrame(tick);
        })(startTime);
    }

    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function show(element) { element && element.classList.remove('hidden-section'); }
    function hide(element) { element && element.classList.add('hidden-section'); }

    function formatTimestamp() {
        return new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(new Date());
    }

    function formatPrintTimestamp() {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'long',
            timeStyle: 'short'
        }).format(new Date());
    }

    function buildPrintReportHtml(report, visibleRows, searchQuery) {
        const generatedAt = formatPrintTimestamp();
        const topCourse = report.coursesCount?.[0]?.[0] || 'N/A';
        const topCourseCount = report.coursesCount?.[0]?.[1] || 0;
        const maxCourseCount = report.coursesCount?.[0]?.[1] || 1;
        const chartItems = report.colCourse
            ? report.coursesCount.slice(0, PRINT_CHART_LIMIT).map(([course, count]) => {
                const pct = Math.max(1, Math.round((count / maxCourseCount) * 100));
                return `
                    <div class="chart-item">
                        <div class="chart-label">
                            <span class="course-name">${escHtml(course)}</span>
                            <span class="course-value">${count.toLocaleString('pt-BR')}</span>
                        </div>
                        <div class="chart-track">
                            <div class="chart-fill" style="width:${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('')
            : '';

        const hiddenCourseCount = Math.max(0, (report.coursesCount?.length || 0) - PRINT_CHART_LIMIT);
        const hasChartData = Boolean(report.colCourse && report.coursesCount?.length);
        const courseHeader = report.colCourse ? '<th>Curso(s)</th>' : '';
        const totalColumns = report.colCourse ? 4 : 3;

        const rowsHtml = visibleRows.map((row, index) => {
            const dateValue = escHtml(row._dateNorm || row[report.colDate] || '');
            const studentValue = escHtml(row[report.colStudent] || '');
            const courseValue = report.colCourse
                ? escHtml((row[report.colCourse] || '').split(' · ').filter(Boolean).join(', '))
                : '';
            return `
                <tr>
                    <td class="cell-number">${index + 1}</td>
                    <td class="cell-date">${dateValue}</td>
                    <td>${studentValue}</td>
                    ${report.colCourse ? `<td>${courseValue || '—'}</td>` : ''}
                </tr>
            `;
        }).join('');

        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Relatório de Presenças</title>
    <style>
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            color: #0f172a;
            font: 12px/1.45 "Inter", "Segoe UI", Arial, sans-serif;
            background: #ffffff;
        }
        .cover-page {
            page-break-after: always;
            break-after: page;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
        }
        .brand-badge {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: linear-gradient(135deg, #2563eb, #4f46e5);
        }
        .title {
            margin: 0;
            font-size: 22px;
            line-height: 1.2;
            font-weight: 800;
            letter-spacing: -0.02em;
        }
        .subtitle {
            margin: 4px 0 0;
            color: #475569;
            font-size: 12px;
        }
        .meta {
            margin: 14px 0 16px;
            padding: 10px 12px;
            border: 1px solid #dbe3ef;
            border-radius: 10px;
            background: #f8fafc;
            color: #334155;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 14px;
        }
        .kpi {
            border: 1px solid #dbe3ef;
            border-radius: 10px;
            padding: 10px;
            background: #ffffff;
        }
        .kpi-label {
            margin: 0 0 6px;
            color: #64748b;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            font-weight: 700;
        }
        .kpi-value {
            margin: 0;
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
        }
        .chart-card {
            border: 1px solid #dbe3ef;
            border-radius: 10px;
            padding: 12px;
            background: #ffffff;
        }
        .chart-title {
            margin: 0 0 10px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #475569;
            font-weight: 700;
        }
        .chart-item {
            margin-bottom: 8px;
            break-inside: avoid;
        }
        .chart-item:last-child { margin-bottom: 0; }
        .chart-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-bottom: 4px;
            font-size: 11px;
        }
        .course-name {
            color: #1e293b;
            max-width: 78%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .course-value {
            color: #1d4ed8;
            font-weight: 700;
        }
        .chart-track {
            width: 100%;
            height: 8px;
            border-radius: 999px;
            background: #e2e8f0;
            overflow: hidden;
        }
        .chart-fill {
            height: 100%;
            border-radius: 999px;
            background: linear-gradient(90deg, #2563eb 0%, #4f46e5 100%);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .chart-note {
            margin: 8px 0 0;
            color: #64748b;
            font-size: 10.5px;
        }
        .empty-note {
            margin: 0;
            color: #64748b;
            font-size: 11px;
        }
        .table-header {
            margin: 0 0 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e2e8f0;
        }
        .table-title {
            margin: 0;
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
        }
        .table-subtitle {
            margin: 4px 0 0;
            color: #64748b;
            font-size: 11px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 11px;
        }
        thead {
            display: table-header-group;
            background: #f8fafc;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        tfoot { display: table-footer-group; }
        th, td {
            border: 1px solid #dbe3ef;
            padding: 6px 8px;
            vertical-align: top;
            word-break: break-word;
        }
        th {
            text-align: left;
            color: #334155;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        tbody tr { break-inside: avoid; }
        tbody tr:nth-child(even) {
            background: #fbfdff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .cell-number {
            width: 7%;
            text-align: right;
            color: #64748b;
            font-variant-numeric: tabular-nums;
        }
        .cell-date {
            width: 20%;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
            color: #334155;
        }
    </style>
</head>
<body>
    <section class="cover-page">
        <div class="brand">
            <div class="brand-badge"></div>
            <div>
                <h1 class="title">Relatório de Presenças Consolidadas</h1>
                <p class="subtitle">Análise de logs Moodle com deduplicação por aluno/dia</p>
            </div>
        </div>

        <div class="meta">
            <strong>Gerado em:</strong> ${escHtml(generatedAt)}<br>
            <strong>Filtro textual:</strong> ${searchQuery ? `“${escHtml(searchQuery)}”` : 'Nenhum'}
        </div>

        <div class="kpi-grid">
            <div class="kpi">
                <p class="kpi-label">Presenças Únicas</p>
                <p class="kpi-value">${report.totalViews.toLocaleString('pt-BR')}</p>
            </div>
            <div class="kpi">
                <p class="kpi-label">Alunos Distintos</p>
                <p class="kpi-value">${report.uniqueStudentsCount.toLocaleString('pt-BR')}</p>
            </div>
            <div class="kpi">
                <p class="kpi-label">Registos na Impressão</p>
                <p class="kpi-value">${visibleRows.length.toLocaleString('pt-BR')}</p>
            </div>
        </div>

        <div class="chart-card">
            <h2 class="chart-title">Distribuição por Curso</h2>
            ${hasChartData ? chartItems : '<p class="empty-note">Sem dados de curso para exibir gráfico.</p>'}
            ${hasChartData ? `<p class="chart-note">Curso líder: ${escHtml(topCourse)} (${topCourseCount.toLocaleString('pt-BR')})${hiddenCourseCount > 0 ? ` · +${hiddenCourseCount} curso(s) no total` : ''}</p>` : ''}
        </div>
    </section>

    <section>
        <header class="table-header">
            <h2 class="table-title">Presenças Consolidadas</h2>
            <p class="table-subtitle">Cada linha representa uma presença única por aluno/dia.</p>
        </header>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Data</th>
                    <th>Aluno</th>
                    ${courseHeader}
                </tr>
            </thead>
            <tbody>
                ${rowsHtml || `<tr><td colspan="${totalColumns}" style="text-align:center;">Nenhum registo disponível com os filtros atuais.</td></tr>`}
            </tbody>
        </table>
    </section>
</body>
</html>`;
    }

    function openProfessionalPrint(report) {
        const visibleRows = getVisibleRows(report, state.searchQuery);
        const html = buildPrintReportHtml(report, visibleRows, state.searchQuery);

        const printWindow = window.open('', 'report_print_preview', 'width=1100,height=900');
        if (!printWindow) {
            UI.toast('Bloqueador de pop-up ativo. Permita pop-ups para imprimir o relatório.', 'error');
            return;
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        printWindow.addEventListener('load', () => {
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 180);
        }, { once: true });

        printWindow.addEventListener('afterprint', () => {
            printWindow.close();
        }, { once: true });
    }

    function getVisibleRows(report, searchQuery) {
        if (!report) return [];
        const q = (searchQuery || '').toLowerCase().trim();
        if (!q) return report.rows;
        return report.rows.filter(row =>
            Object.values(row).some(v => String(v).toLowerCase().includes(q))
        );
    }

    function normaliseDate(rawDate) {
        if (!rawDate) return '';
        const s = rawDate.trim();
        const dmyMatch = s.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (dmyMatch) return dmyMatch[1];
        const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (isoMatch) return isoMatch[1];
        return s.split(/[\s,T]/)[0];
    }

    function parseCSV(text) {
        const lines = text.trim().split(/\r\n|\n|\r/);
        if (lines.length < 2) throw new Error('O ficheiro CSV está vazio.');
        const sample = lines[0];
        const delimiter = (sample.match(/;/g) || []).length >= (sample.match(/,/g) || []).length ? ';' : ',';

        const splitLine = (line) => {
            const cols = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                    else { inQuotes = !inQuotes; }
                } else if (ch === delimiter && !inQuotes) {
                    cols.push(current.trim()); current = '';
                } else { current += ch; }
            }
            cols.push(current.trim());
            return cols;
        };

        const rawHeaders = splitLine(lines[0]);
        const cleanHeaders = rawHeaders.map(h => h.replace(/^\uFEFF/, '').trim());
        if (cleanHeaders.length < 2) throw new Error('Poucas colunas detectadas. Verifique o delimitador.');

        const parsedData = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = splitLine(line);
            const row = {};
            cleanHeaders.forEach((header, idx) => { row[header] = values[idx] ?? ''; });
            parsedData.push(row);
        }
        if (parsedData.length === 0) throw new Error('O ficheiro não contém linhas de dados válidas.');
        return { parsedHeaders: cleanHeaders, parsedData };
    }

    function guessColumn(keywords) {
        return state.headers.find(h =>
            keywords.some(k => h.toLowerCase().includes(k.toLowerCase()))
        ) ?? '';
    }

    function populateSelect(selectEl, options, placeholder = 'Selecione a coluna…') {
        selectEl.innerHTML = `<option value="">${escHtml(placeholder)}</option>`;
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.textContent = opt;
            selectEl.appendChild(o);
        });
    }

    function generateReport() {
        const colStudent = el.selStudent.value;
        const colDate = el.selDate.value;
        const colCourse = el.selCourse.value;
        const filterDate = el.inputDate.value.trim().toLowerCase();
        const excludeRaw = el.inputExclude.value;

        if (!state.rawData.length || !colStudent || !colDate) {
            state.report = null;
            hide(el.resultsArea);
            show(el.emptyState);
            return;
        }

        const excludedList = excludeRaw.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);

        const preFiltered = state.rawData.filter(row => {
            const rowDate = (row[colDate] ?? '').toLowerCase();
            if (filterDate && !rowDate.includes(filterDate)) return false;
            const studentName = (row[colStudent] ?? '').toLowerCase();
            if (excludedList.some(ex => studentName.includes(ex))) return false;
            return true;
        });

        const groups = new Map();
        preFiltered.forEach(row => {
            const student = (row[colStudent] ?? '').trim();
            const dateKey = normaliseDate(row[colDate] ?? '');
            const key = `${student.toLowerCase()}|${dateKey.toLowerCase()}`;
            if (!groups.has(key)) {
                groups.set(key, { row: { ...row, _dateNorm: dateKey }, coursesSet: new Set() });
            }
            if (colCourse) {
                const c = (row[colCourse] ?? '').trim();
                if (c) groups.get(key).coursesSet.add(c);
            }
        });

        const dedupedRows = [];
        groups.forEach(({ row, coursesSet }) => {
            const synthesised = { ...row };
            if (colCourse) {
                synthesised[colCourse] = coursesSet.size > 0 ? [...coursesSet].join(' · ') : '';
            }
            dedupedRows.push(synthesised);
        });

        const uniqueStudents = new Set(dedupedRows.map(r => r[colStudent]));
        const coursesCount = {};
        if (colCourse) {
            const courseSeenKey = new Set();
            preFiltered.forEach(row => {
                const student = (row[colStudent] ?? '').trim();
                const dateKey = normaliseDate(row[colDate] ?? '');
                const c = (row[colCourse] ?? '').trim() || 'Desconhecido';
                const ck = `${student.toLowerCase()}|${dateKey.toLowerCase()}|${c.toLowerCase()}`;
                if (!courseSeenKey.has(ck)) {
                    courseSeenKey.add(ck);
                    coursesCount[c] = (coursesCount[c] || 0) + 1;
                }
            });
        }
        const sortedCourses = Object.entries(coursesCount).sort((a, b) => b[1] - a[1]);

        state.report = {
            rows: dedupedRows,
            totalViews: dedupedRows.length,
            uniqueStudentsCount: uniqueStudents.size,
            coursesCount: sortedCourses,
            colStudent, colDate, colCourse
        };
        state.currentPage = 1;
        renderResults();
    }

    function renderResults() {
        const { report, currentPage } = state;
        if (!report) return;

        hide(el.emptyState);
        show(el.resultsArea);

        animateCounter(el.statViews, report.totalViews);
        animateCounter(el.statStudents, report.uniqueStudentsCount);
        if (el.resultTimestamp) el.resultTimestamp.textContent = formatTimestamp();

        if (report.colCourse && report.coursesCount.length > 0) {
            show(el.chartArea);
            el.chartContainer.innerHTML = '';
            const maxVal = report.coursesCount[0][1];
            report.coursesCount.forEach(([course, count]) => {
                const pct = (count / maxVal * 100).toFixed(1);
                const item = document.createElement('div');
                item.innerHTML = `
                    <div class="flex justify-between items-end text-xs mb-1.5">
                        <span class="font-medium text-slate-300 truncate pr-3" title="${escHtml(course)}">${escHtml(course)}</span>
                        <span class="text-white font-bold shrink-0 bg-blue-900 bg-opacity-40 px-2 py-0.5 rounded text-[11px]">${count}</span>
                    </div>
                    <div class="w-full bg-white bg-opacity-10 rounded-full" style="height:8px">
                        <div class="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700" style="width:0%" data-target="${pct}"></div>
                    </div>`;
                el.chartContainer.appendChild(item);
            });
            requestAnimationFrame(() => {
                el.chartContainer.querySelectorAll('[data-target]').forEach(bar => {
                    bar.style.width = bar.dataset.target + '%';
                });
            });
        } else { hide(el.chartArea); }

        const visibleRows = getVisibleRows(report, state.searchQuery);
        const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
        const safePage = Math.min(currentPage, totalPages);
        state.currentPage = safePage;
        const pageRows = visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

        el.tableHeader.innerHTML = `
            <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Data</th>
            <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Aluno</th>
            ${report.colCourse ? '<th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Curso(s)</th>' : ''}
        `;
        el.tableCount.textContent = `${visibleRows.length.toLocaleString('pt-BR')} registos`;

        el.tableBody.innerHTML = '';
        if (pageRows.length === 0) {
            show(el.tableEmpty);
            hide(el.pagination);
        } else {
            hide(el.tableEmpty);
            const fragment = document.createDocumentFragment();
            pageRows.forEach((row, idx) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-white hover:bg-opacity-5 transition-colors border-b border-white border-opacity-5';
                tr.innerHTML = `
                    <td class="px-4 py-2.5 text-slate-400 text-xs tabular-nums whitespace-nowrap">${escHtml(row._dateNorm || row[report.colDate])}</td>
                    <td class="px-4 py-2.5 font-semibold text-white text-sm">${escHtml(row[report.colStudent])}</td>
                    ${report.colCourse ? `<td class="px-4 py-2.5 text-xs">${
                        (row[report.colCourse] || '').split(' · ').filter(Boolean)
                            .map(c => `<span class="inline-block bg-blue-500 bg-opacity-20 text-blue-300 border border-blue-500 border-opacity-30 rounded px-2 py-0.5 mr-1 mb-0.5 text-[11px] font-medium">${escHtml(c.length > 40 ? c.slice(0, 38) + '…' : c)}</span>`)
                            .join('')
                    }</td>` : ''}
                `;
                fragment.appendChild(tr);
            });
            el.tableBody.appendChild(fragment);

            if (totalPages > 1) {
                show(el.pagination);
                el.paginationInfo.textContent = `Página ${safePage} de ${totalPages}`;
                el.btnPrev.disabled = safePage <= 1;
                el.btnNext.disabled = safePage >= totalPages;
            } else { hide(el.pagination); }
        }

        try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch(e) {}
    }

    function handleFileUpload(file, text) {
        try {
            const { parsedHeaders, parsedData } = parseCSV(text);
            state.headers = parsedHeaders;
            state.rawData = parsedData;
            state.currentPage = 1;
            state.searchQuery = '';

            const _info = document.getElementById('rpt-file-info');
            if (_info) _info.textContent = `${file.name} · ${parsedData.length} registos`;

            populateSelect(el.selStudent, state.headers);
            populateSelect(el.selDate, state.headers);
            populateSelect(el.selCourse, state.headers, 'Nenhuma / Não aplicável');

            el.selStudent.value = guessColumn(['nome completo', 'nome do usuário', 'nome do utilizador', 'aluno', 'nome', 'estudante', 'student', 'name']);
            el.selDate.value    = guessColumn(['hora', 'data', 'date', 'criado', 'timestamp', 'inicio', 'time']);
            el.selCourse.value  = guessColumn(['nome do evento', 'evento', 'curso', 'course', 'aula', 'módulo', 'modulo', 'context']);
            if (el.tableSearch) el.tableSearch.value = '';

            document.getElementById('section-report').classList.remove('hidden-section');
            show(el.configArea);
            generateReport();
            try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch(e) {}
        } catch (err) {
            UI.toast('Erro ao processar o relatório: ' + err.message, 'error');
        }
    }

    function init() {
        // Guard: verifica se a seção do relatório está no DOM
        if (!document.getElementById('rpt-sel-student')) {
            console.warn('[ReportApp] Section not found in DOM — init skipped');
            return;
        }
        el = {
            configArea:   $('config-area'),
            selStudent:   $('rpt-sel-student'),
            selDate:      $('rpt-sel-date'),
            selCourse:    $('rpt-sel-course'),
            inputDate:    $('rpt-input-date'),
            inputExclude: $('rpt-input-exclude'),
            resultsArea:  $('rpt-results-area'),
            emptyState:   $('rpt-empty-state'),
            statViews:    $('rpt-stat-views'),
            statStudents: $('rpt-stat-students'),
            resultTimestamp: $('result-timestamp'),
            chartArea:    $('rpt-chart-area'),
            chartContainer: $('rpt-chart-container'),
            tableHeader:  $('rpt-table-header'),
            tableBody:    $('rpt-table-body'),
            tableEmpty:   $('rpt-table-empty'),
            tableCount:   $('rpt-table-count'),
            tableSearch:  $('rpt-table-search'),
            pagination:   $('rpt-pagination'),
            paginationInfo: $('rpt-pagination-info'),
            btnPrev:      $('rpt-btn-prev'),
            btnNext:      $('rpt-btn-next'),
            btnExport:    $('rpt-btn-export'),
            btnPrint:     $('rpt-btn-print'),
        };

        const debouncedGenerate = debounce(generateReport, DEBOUNCE_MS);
        // [BUG FIX] Classe correta é 'config-input' (sem prefixo rpt-), conforme definido no HTML
        document.querySelectorAll('#section-report .config-input').forEach(el => {
            el.addEventListener('input', debouncedGenerate);
            el.addEventListener('change', debouncedGenerate);
        });

        el.tableSearch.addEventListener('input', debounce((e) => {
            state.searchQuery = e.target.value.trim();
            state.currentPage = 1;
            renderResults();
        }, 200));

        el.btnPrev.addEventListener('click', () => { if (state.currentPage > 1) { state.currentPage--; renderResults(); } });
        el.btnNext.addEventListener('click', () => {
            if (state.report) {
                const totalPages = Math.max(1, Math.ceil(getVisibleRows(state.report, state.searchQuery).length / PAGE_SIZE));
                if (state.currentPage < totalPages) { state.currentPage++; renderResults(); }
            }
        });

        el.btnExport.addEventListener('click', () => {
            const { report } = state;
            if (!report?.rows.length) return;
            const exportHeaders = ['Data', 'Aluno'];
            if (report.colCourse) exportHeaders.push('Cursos do Dia');
            const lines = [exportHeaders.join(',')];
            report.rows.forEach(row => {
                const dateVal = row._dateNorm || normaliseDate(row[report.colDate] ?? '');
                const coursesVal = report.colCourse ? (row[report.colCourse] || '').replace(/·/g, '|') : null;
                const cells = [`"${String(dateVal).replace(/"/g, '""')}"`, `"${String(row[report.colStudent] ?? '').replace(/"/g, '""')}"`];
                if (report.colCourse) cells.push(`"${String(coursesVal ?? '').replace(/"/g, '""')}"`);
                lines.push(cells.join(','));
            });
            const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: `relatorio_presencas_${new Date().toISOString().slice(0, 10)}.csv` });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        });

        if (el.btnPrint) {
            el.btnPrint.addEventListener('click', () => {
                if (!state.report?.rows?.length) return;
                openProfessionalPrint(state.report);
            });
        }

    }

    return { init, handleFileUpload };
})();

// ══════════════════════════════════════════════════════════════
// SMART CSV DETECTOR — Detecta automaticamente o tipo de CSV
// ══════════════════════════════════════════════════════════════
function detectCsvType(headers) {
    const norm = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim());
    
    // Sinais de CSV de LOG do Moodle (relatório)
    const logSignals = ['hora', 'contexto', 'componente', 'nome do evento', 'evento', 'descricao', 'origem', 'endereco ip'];
    const logScore = logSignals.filter(sig => norm.some(h => h.includes(sig))).length;
    
    // Sinais de planilha de ALUNOS (conversor)
    const alunoSignals = ['matricula', 'turma', 'nome completo', 'cpf', 'data de nascimento', 'sexo', 'nome mae', 'celular'];
    const alunoScore = alunoSignals.filter(sig => norm.some(h => h.includes(sig))).length;
    
    if (logScore >= 2 && logScore > alunoScore) return 'log';
    if (alunoScore >= 2) return 'alunos';
    // Heurística adicional: presença de "hora" ou "evento" é forte sinal de log
    const hasHora   = norm.some(h => h === 'hora' || h.startsWith('hora '));
    const hasEvento = norm.some(h => h.includes('evento') || h.includes('event'));
    if (hasHora || hasEvento) return 'log';

    const hasAluno = norm.some(h => h.includes('nome') || h.includes('aluno') || h.includes('utilizador') || h.includes('usuario'));
    const hasData  = norm.some(h => h.includes('data') || h.includes('hora') || h.includes('time'));
    const hasStudentSignal = norm.some(h => h.includes('matricula') || h.includes('turma') || h.includes('cpf') || h.includes('nascimento'));
    // Só assume 'log' se não tiver sinais de planilha de alunos
    if (hasAluno && hasData && !hasStudentSignal) return 'log';
    return 'alunos'; // padrão
}

const FileReaders = {
    readAsText(file, encoding = 'UTF-8') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
            reader.readAsText(file, encoding);
        });
    },
};

const ToolRouter = {
    async routeFile(file) {
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'zip') {
            UI.toast('Arraste a pasta com os documentos, não um ZIP. Use a área principal.', 'info');
            return;
        }

        if (['xlsx', 'xls'].includes(ext)) {
            CsvApp.handleFileUpload(file);
            return;
        }

        if (ext === 'csv') {
            await this._routeCsv(file);
            return;
        }

        throw new Error(`Formato "${ext.toUpperCase()}" não suportado. Use .csv, .xlsx ou .xls`);
    },

    async _routeCsv(file) {
        const text = await FileReaders.readAsText(file, 'UTF-8');
        const firstLine = text.split(/\r?\n/)[0] || '';
        const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
        const headers = firstLine
            .split(delimiter)
            .map(h => h.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim());

        const type = detectCsvType(headers);
        if (type === 'log') {
            UI.toast('Relatório de logs detectado! Abrindo análise de visualizações…', 'info');
            ReportApp.handleFileUpload(file, text);
            return;
        }

        UI.toast('Planilha de alunos detectada! Abrindo conversor Moodle…', 'info');
        CsvApp.handleFileUpload(file);
    },
};

async function handleSmartCsvUpload(file) {
    if (!file) return;
    try {
        await ToolRouter.routeFile(file);
    } catch (err) {
        Logger.warn('[handleSmartCsvUpload] Falha no roteamento', { fileName: file?.name, err });
        UI.toast(err.message || 'Falha ao identificar o tipo de arquivo.', 'error');
    }
}

