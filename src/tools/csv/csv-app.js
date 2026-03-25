class CsvUtils {
    static formatarData(data) {
        if (!data) return '';
        try {
            let dataFormatada = '';
            if (typeof data === 'number') {
                const date = new Date(Math.round((data - 25569) * 86400 * 1000));
                dataFormatada = date.toISOString().slice(0, 10);
            } else {
                const str = String(data).trim();
                let match = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
                if (match) {
                    const [, dia, mes, ano] = match;
                    dataFormatada = `${ano}-${mes}-${dia}`;
                } else {
                    match = str.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
                    if (match) {
                        const [, ano, mes, dia] = match;
                        dataFormatada = `${ano}-${mes}-${dia}`;
                    } else {
                        const dataObj = new Date(str);
                        if (!isNaN(dataObj.getTime())) {
                            dataFormatada = dataObj.toISOString().slice(0, 10);
                        } else {
                            return str;
                        }
                    }
                }
            }
            return dataFormatada;
        } catch (error) {
            return data;
        }
    }

    static convertToCSV(data) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        return data.map(row => {
            return row.map(cell => {
                const value = String(cell || '').trim();
                if (dateRegex.test(value)) {
                    return '"' + value + '"';
                }
                if (value.includes(',') || value.includes(';') || value.includes('"')) {
                    return '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            }).join(';');
        }).join('\n');
    }

    static createTable(data, container) {
        if (!data || data.length === 0) return;
        const validColumns = data[0].map((_, colIndex) => {
            return data.some(row => row[colIndex] && row[colIndex].toString().trim() !== '');
        });
        const table = document.createElement('table');
        table.className = 'w-full border-collapse';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        data[0].forEach((header, index) => {
            if (validColumns[index] && header && header.trim() !== '') {
                const th = document.createElement('th');
                th.textContent = header;
                th.className = 'bg-indigo-500 bg-opacity-20 text-white font-semibold sticky top-0 px-3 py-2 text-left text-sm border-b border-white border-opacity-10';
                headerRow.appendChild(th);
            }
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (let i = 1; i < data.length; i++) {
            const row = document.createElement('tr');
            row.className = 'hover:bg-white hover:bg-opacity-5 transition-colors border-b border-white border-opacity-5';
            data[i].forEach((cell, index) => {
                if (validColumns[index] && data[0][index] && data[0][index].trim() !== '') {
                    const td = document.createElement('td');
                    td.textContent = cell || '';
                    td.className = 'px-3 py-2 text-sm text-slate-300';
                    row.appendChild(td);
                }
            });
            if (row.children.length > 0) {
                tbody.appendChild(row);
            }
        }
        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
    }
}

class CsvFileProcessor {
    static FIELD_MAPPINGS = {
        'nome_completo': { input: ['nome completo', 'nome_completo', 'nome', 'discente', 'aluno'], firstname: 'firstname', lastname: 'lastname' },
        'turma': { input: ['turma', 'classe', 'curso'], output: 'cohort1' },
        'email': { input: ['email', 'e-mail', 'correio eletronico'], output: 'email' },
        'cpf': { input: ['cpf', 'documento_cpf'], output: 'profile_field_cpf' },
        'sexo': { input: ['sexo', 'genero'], output: 'profile_field_origens_14' },
        'nomepai': { input: ['nome do pai', 'nome pai', 'filiacao 1', 'filiacao1'], output: 'profile_field_nomepai' },
        'nomemae': { input: ['nome da mae', 'nome mae', 'filiacao 2', 'filiacao2', 'nome da ma'], output: 'profile_field_nomemae' },
        'dtnasc': { input: ['data de nascimento', 'dtnasc', 'data nascimento', 'nascimento'], output: 'profile_field_dtnasc' },
        'celular': { input: ['celular', 'telefone', 'whatsapp', 'contato'], output: 'profile_field_celular' },
        'docidentif': { input: ['documento de identificacao', 'rg', 'documento', 'identidade'], output: 'profile_field_docidentif' },
        'orgexpident': { input: ['orgao expedidor', 'org exp', 'orgao'], output: 'profile_field_orgexpident' },
        'dataexpedicao': { input: ['data de expedicao', 'data expedicao', 'emissao'], output: 'profile_field_dataexpedicao' },
        'endereco': { input: ['endereco', 'rua', 'logradouro', 'morada'], output: 'profile_field_endereco' },
        'bairro': { input: ['bairro', 'distrito'], output: 'profile_field_bairro' },
        'cidade': { input: ['cidade', 'municipio'], output: 'profile_field_cidade' },
        'uf': { input: ['uf', 'estado', 'provincia'], output: 'profile_field_uf' },
        'cep': { input: ['cep', 'codigo postal'], output: 'profile_field_cep' },
        'matricula_esap': { input: ['matricula esap', 'matricula', 'numero de matricula'], output: 'profile_field_matricula_esap' }
    };

    constructor() {
        this.rawData = [];
        this.processedData = [];
        this.transformedContent = '';
        this.currentFile = null;
    }

    async processFile(file, selectedFields) {
        this.currentFile = file;
        try {
            const data = await this.readFileAsArrayBuffer(file);
            let result;
            if (file.name.endsWith('.csv')) {
                result = this.processCsvData(data);
            } else {
                result = this.processExcelData(data);
            }
            return this.processRawData(result, selectedFields);
        } catch (error) {
            throw new Error(`Erro ao processar arquivo: ${error.message}`);
        }
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Falha ao ler o arquivo'));
            reader.readAsArrayBuffer(file);
        });
    }

    processExcelData(data) {
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    }

    processCsvData(data) {
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    }

    normalizeHeader(header) {
        if (!header) return '';
        return header.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").trim();
    }

    getColumnIndices(headers) {
        const indices = {};
        const normalizedHeaders = headers.map(h => this.normalizeHeader(h));
        
        for (const [key, fieldInfo] of Object.entries(CsvFileProcessor.FIELD_MAPPINGS)) {
            let foundIndex = -1;
            for (const inputVariant of fieldInfo.input) {
                const normalizedVariant = this.normalizeHeader(inputVariant);
                foundIndex = normalizedHeaders.findIndex(h => h.includes(normalizedVariant));
                if (foundIndex !== -1) {
                    break;
                }
            }
            indices[key] = foundIndex;
        }
        return indices;
    }

    formatCEP(cep) {
        if (!cep) return '';
        let str = String(cep).replace(/\D/g, '');
        str = str.padStart(8, '0');
        if (str.length === 8) {
            return str.replace(/^(\d{5})(\d{3})$/, '$1-$2');
        }
        return str;
    }

    formatPhone(phone) {
        if (!phone) return '';
        const numStr = String(phone);
        let cleaned = numStr.replace(/\D/g, '');
        if (cleaned.startsWith('55') && cleaned.length > 11) {
            cleaned = cleaned.substring(2);
        }
        return cleaned;
    }

    formatSex(sex) {
        if (!sex) return '';
        const normalized = this.normalizeHeader(sex);
        if (normalized.startsWith('f') || normalized === 'mulher') return 'Feminino';
        if (normalized.startsWith('m') || normalized === 'homem') return 'Masculino';
        return sex;
    }

    processRawData(rawRows, selectedFields) {
        if (!rawRows || rawRows.length < 2) {
            throw new Error('O arquivo parece estar vazio ou não possui cabeçalhos e dados');
        }
        const parsedRows = rawRows.map(row => 
            row.map(cell => typeof cell === 'string' && cell.startsWith('"') && cell.endsWith('"') 
                ? cell.replace(/^"|"$/g, '').replace(/""/g, '"') 
                : cell
            )
        );
        let headerRowIndex = 0;
        let maxMatches = 0;
        
        for (let i = 0; i < Math.min(10, parsedRows.length); i++) {
            const matches = this.countHeaderMatches(parsedRows[i]);
            if (matches > maxMatches) {
                maxMatches = matches;
                headerRowIndex = i;
            }
        }

        const headers = parsedRows[headerRowIndex];
        const dataRows = parsedRows.slice(headerRowIndex + 1);
        const columnIndices = this.getColumnIndices(headers);

        const requiredFields = ['nome_completo', 'turma', 'matricula_esap'];
        const missingFields = requiredFields.filter(f => columnIndices[f] === -1);
        if (missingFields.length > 0) {
            throw new Error(`Campos obrigatórios não encontrados: ${missingFields.join(', ')}`);
        }

        const fieldsToProcess = ['nome_completo', 'turma', 'matricula_esap', ...selectedFields.filter(f => !requiredFields.includes(f))];
        const newHeaders = fieldsToProcess.map(field => {
            const index = columnIndices[field];
            return index !== -1 ? headers[index] : field;
        });

        this.processedData = [newHeaders];
        
        // Remove linhas totalmente vazias
        const filteredDataRows = dataRows.filter(row => row.some(cell => cell && String(cell).trim() !== ''));

        filteredDataRows.forEach(row => {
            const newRow = fieldsToProcess.map(field => {
                const index = columnIndices[field];
                let value = index !== -1 ? row[index] : '';
                
                if (value !== null && value !== undefined) {
                    if (field === 'dtnasc' || field === 'dataexpedicao') {
                        value = CsvUtils.formatarData(value);
                    } else if (field === 'cep') {
                        value = this.formatCEP(value);
                    } else if (field === 'celular') {
                        value = this.formatPhone(value);
                    } else if (field === 'sexo') {
                        value = this.formatSex(value);
                    }
                }
                return value;
            });
            this.processedData.push(newRow);
        });

        return this.processedData;
    }

    countHeaderMatches(row) {
        if (!row || row.length === 0) return 0;
        const normalizedRow = row.map(h => this.normalizeHeader(h));
        let matches = 0;
        const searchTerms = ['nome', 'turma', 'matricula', 'email', 'cpf', 'data', 'telefone', 'celular', 'curso'];
        for (const term of searchTerms) {
            if (normalizedRow.some(h => h && h.includes(term))) {
                matches++;
            }
        }
        return matches;
    }

    generatePassword() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    transformData(selectedFields) {
        if (!this.processedData || this.processedData.length < 2) {
            throw new Error('Nenhum dado processado disponível');
        }

        const headers = this.processedData[0];
        const dataRows = this.processedData.slice(1);
        
        const columnIndices = {};
        headers.forEach((h, i) => {
            const norm = this.normalizeHeader(h);
            const entry = Object.entries(CsvFileProcessor.FIELD_MAPPINGS).find(([k, v]) => 
                v.input.some(inputField => norm.includes(this.normalizeHeader(inputField)))
            );
            if(entry) columnIndices[entry[0]] = i;
        });

        const outputHeaders = ['firstname', 'lastname', 'username', 'email', 'Password'];
        
        const activeFields = ['nome_completo', 'turma', 'matricula_esap', ...selectedFields.filter(f => !['nome_completo', 'turma', 'matricula_esap'].includes(f))];
        
        activeFields.forEach(fieldKey => {
            if (fieldKey !== 'nome_completo' && fieldKey !== 'email') {
                const mapping = CsvFileProcessor.FIELD_MAPPINGS[fieldKey];
                if (mapping && mapping.output) {
                    outputHeaders.push(mapping.output);
                }
            }
        });

        const transformedArray = [outputHeaders];
        let processedCount = 0;

        dataRows.forEach(row => {
            const nomeIndex = columnIndices['nome_completo'];
            if (nomeIndex === undefined || !row[nomeIndex]) return;

            const nomeCompleto = String(row[nomeIndex]).trim();
            const lastSpaceIndex = nomeCompleto.lastIndexOf(' ');
            
            let firstname = nomeCompleto;
            let lastname = '';
            
            if (lastSpaceIndex !== -1) {
                firstname = nomeCompleto.substring(0, lastSpaceIndex).trim();
                lastname = nomeCompleto.substring(lastSpaceIndex + 1).trim();
            } else {
                lastname = '.';
            }

            const cpfIndex = columnIndices['cpf'];
            let cpfValue = cpfIndex !== undefined && row[cpfIndex] ? String(row[cpfIndex]).replace(/\D/g, '') : '';
            const isCPFValid = cpfValue && cpfValue.length === 11;
            const username = isCPFValid ? cpfValue : (firstname.split(' ')[0].toLowerCase() + Math.floor(Math.random() * 1000));

            const emailIndex = columnIndices['email'];
            const email = emailIndex !== undefined && row[emailIndex] ? String(row[emailIndex]).trim() : '';

            const password = this.generatePassword();

            const transformedRow = [firstname, lastname, username, email, password];

            activeFields.forEach(fieldKey => {
                if (fieldKey !== 'nome_completo' && fieldKey !== 'email') {
                    const idx = columnIndices[fieldKey];
                    transformedRow.push(idx !== undefined ? (row[idx] || '') : '');
                }
            });

            transformedArray.push(transformedRow);
            processedCount++;
        });

        this.transformedContent = CsvUtils.convertToCSV(transformedArray);
        return { transformedArray, processedCount };
    }
}

class CsvApp {
    static init() {
        this.fileProcessor = new CsvFileProcessor();
        this.selectedFields = [];
        this.setupEventListeners();
    }

    static getRequiredFieldKeys() {
        return ['nome_completo', 'turma', 'matricula_esap'];
    }

    static getOptionalFieldKeys() {
        return Array.from(this.el.csvCheckboxes)
            .filter(cb => !cb.disabled)
            .map(cb => cb.value);
    }

    static syncSelectAllState() {
        if (!this.el.csvSelectAll) return;

        const optionalCheckboxes = Array.from(this.el.csvCheckboxes).filter(cb => !cb.disabled);
        const checkedCount = optionalCheckboxes.filter(cb => cb.checked).length;
        const totalCount = optionalCheckboxes.length;

        this.el.csvSelectAll.indeterminate = checkedCount > 0 && checkedCount < totalCount;
        this.el.csvSelectAll.checked = totalCount > 0 && checkedCount === totalCount;
    }

    static setupEventListeners() {
        // Elements
        this.el = {
            csvSectionInput: document.getElementById('csv-field-selection'),
            csvSectionOriginal: document.getElementById('csv-original-container'),
            csvSectionTransformed: document.getElementById('csv-transformed-container'),
            csvReadBtn: document.getElementById('csv-read-btn'),
            csvTransformBtn: document.getElementById('csv-transform-btn'),
            csvDownloadBtn: document.getElementById('csv-download-btn'),
            csvBackBtn: document.getElementById('csv-back-btn'),
            csvReportBtn: document.getElementById('csv-report-btn'),
            csvSelectAll: document.getElementById('csv-select-all'),
            csvCheckboxes: document.querySelectorAll('#csv-checkboxes input[type="checkbox"]'),
            csvTableContainer: document.getElementById('csv-table-container'),
            csvTransformedTableContainer: document.getElementById('csv-transformed-table-container'),
            csvFileInfo: document.getElementById('csv-file-info')
        };

        if (this.el.csvSelectAll) {
            this.el.csvSelectAll.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                this.el.csvCheckboxes.forEach(cb => {
                    if (!cb.disabled) cb.checked = isChecked;
                });
                this.syncSelectAllState();
            });
        }

        this.el.csvCheckboxes.forEach(cb => {
            if (cb.disabled) return;
            cb.addEventListener('change', () => this.syncSelectAllState());
        });

        if (this.el.csvReadBtn) this.el.csvReadBtn.addEventListener('click', () => this.handleReadButtonClick());
        if (this.el.csvTransformBtn) this.el.csvTransformBtn.addEventListener('click', () => this.handleTransformButtonClick());
        if (this.el.csvDownloadBtn) this.el.csvDownloadBtn.addEventListener('click', () => this.handleDownloadButtonClick());
        if (this.el.csvBackBtn) this.el.csvBackBtn.addEventListener('click', () => {
            this.el.csvSectionTransformed.classList.add('hidden-section');
            this.el.csvSectionOriginal.classList.remove('hidden-section');
        });
        if (this.el.csvReportBtn) this.el.csvReportBtn.addEventListener('click', () => this.handleReportButtonClick());
    }

    static handleFileUpload(file) {
        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
            UI.toast('Formato inválido. Envie um arquivo Excel (.xlsx, .xls) ou CSV.', 'error');
            return;
        }

        this.currentFile = file;
        this.el.csvFileInfo.textContent = `Arquivo selecionado: ${file.name} (${Utils.formatBytes(file.size)})`;
        this.el.csvFileInfo.classList.remove('hidden-section');
        
        document.getElementById('section-csv').classList.remove('hidden-section');
        this.el.csvSectionInput.classList.remove('hidden-section');
        this.el.csvSectionOriginal.classList.add('hidden-section');
        this.el.csvSectionTransformed.classList.add('hidden-section');

        this.el.csvCheckboxes.forEach(cb => {
            if (!cb.disabled) cb.checked = false;
        });
        if (this.el.csvSelectAll) {
            this.el.csvSelectAll.checked = false;
            this.el.csvSelectAll.indeterminate = false;
        }

        this.el.csvReadBtn.disabled = false;
        this.selectedFields = this.getRequiredFieldKeys();
        this.syncSelectAllState();

        UI.toast(`Planilha reconhecida: ${file.name}`, 'info');
    }

    static getSelectedFields() {
        const requiredFields = this.getRequiredFieldKeys();
        const optionalFields = this.getOptionalFieldKeys();

        const checkedOptionalFields = this.el.csvSelectAll && this.el.csvSelectAll.checked
            ? optionalFields
            : Array.from(this.el.csvCheckboxes)
                .filter(cb => !cb.disabled && cb.checked)
                .map(cb => cb.value);

        return [...new Set([...requiredFields, ...checkedOptionalFields])];
    }

    static async handleReadButtonClick() {
        if (!this.currentFile) {
            UI.toast('Por favor, selecione um arquivo primeiro.', 'error');
            return;
        }

        this.selectedFields = this.getSelectedFields();
        const btn = this.el.csvReadBtn;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="w-4 h-4 spin-slow" data-lucide="loader"></i> Lendo...';
        btn.disabled = true;

        try {
            const timeStart = Date.now();
            // Simular pequeno delay para UI responder
            await new Promise(r => setTimeout(r, 100)); 
            
            const rawData = await this.fileProcessor.processFile(this.currentFile, this.selectedFields);
            
            if (rawData && rawData.length > 0) {
                CsvUtils.createTable(rawData, this.el.csvTableContainer);
                this.el.csvSectionInput.classList.add('hidden-section');
                this.el.csvSectionOriginal.classList.remove('hidden-section');
                UI.toast(`Planilha lida com sucesso! ${rawData.length - 1} linhas encontradas.`, 'success');
            }
            if(window.lucide) lucide.createIcons();
        } catch (error) {
            UI.toast(error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    static handleTransformButtonClick() {
        try {
            const result = this.fileProcessor.transformData(this.selectedFields);
            if (result && result.transformedArray) {
                CsvUtils.createTable(result.transformedArray, this.el.csvTransformedTableContainer);
                this.el.csvSectionOriginal.classList.add('hidden-section');
                this.el.csvSectionTransformed.classList.remove('hidden-section');
                
                // Update final results visual
                document.getElementById('csv-summary-text').textContent = `${result.processedCount} registros formatados e validados!`;
            }
        } catch (error) {
            UI.toast(error.message, 'error');
        }
    }

    static handleDownloadButtonClick() {
        if (!this.fileProcessor.transformedContent) {
            UI.toast('Não há dados transformados para baixar.', 'error');
            return;
        }
        const blob = new Blob(["\uFEFF" + this.fileProcessor.transformedContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, 'moodle_import.csv');
        UI.toast('Arquivo Moodle CSV transferido com sucesso!', 'success');
    }

    static handleReportButtonClick() {
        // Crie um relatório bonito a partir dos dados!
        const processed = this.fileProcessor.processedData;
        if(!processed || processed.length === 0) {
            UI.toast("Sem dados para gerar relatório", "error");
            return;
        }
        
        // [BUG FIX] doc.autoTable() requer plugin jspdf-autotable (ausente).
        // Solução: gerar HTML do relatório e abrir em nova aba para impressão/salvamento.
        const now = new Date().toLocaleString('pt-BR');
        const head = processed[0];
        const colMap = {};
        head.forEach((h, idx) => {
            const hNorm = h.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (hNorm.includes('nome')) colMap.nome = idx;
            if (hNorm.includes('matricula')) colMap.mat = idx;
            if (hNorm.includes('turma')) colMap.turma = idx;
            if (hNorm.includes('cpf')) colMap.cpf = idx;
        });
        const getVal = (row, key) => (colMap[key] !== undefined ? (row[colMap[key]] || 'N/A') : 'N/A');
        const rows = processed.slice(1).map((row, i) => {
            let cpfStatus = 'Sem CPF';
            if (colMap.cpf !== undefined && row[colMap.cpf]) {
                cpfStatus = String(row[colMap.cpf]).replace(/\D/g, '').length === 11 ? '✓ Válido' : '✗ Inválido';
            }
            return `<tr><td>${i + 1}</td><td>${getVal(row,'nome')}</td><td>${getVal(row,'mat')}</td><td>${getVal(row,'turma')}</td><td>${cpfStatus}</td></tr>`;
        }).join('');
        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório CSV — ${now}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#1e293b}h1{font-size:20px;margin:0 0 4px}p{color:#64748b;font-size:12px;margin:0 0 20px}
table{width:100%;border-collapse:collapse;font-size:13px}th{background:#4f46e5;color:#fff;padding:8px 12px;text-align:left}td{padding:7px 12px;border-bottom:1px solid #e2e8f0}
tr:nth-child(even) td{background:#f8fafc}@media print{body{padding:0}}</style></head>
<body><h1>📊 Relatório de Processamento CSV</h1>
<p>Arquivo: ${this.currentFile ? this.currentFile.name : 'N/A'} &nbsp;·&nbsp; ${processed.length - 1} alunos &nbsp;·&nbsp; ${now}</p>
<table><thead><tr><th>#</th><th>Nome</th><th>Matrícula</th><th>Turma</th><th>CPF</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=()=>window.print()<\/script></body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `Relatorio_Processamento_CSV.html` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        UI.toast('Relatório gerado com sucesso! Abrindo para impressão...', 'success');
    }
}

