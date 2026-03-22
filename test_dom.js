const fs = require('fs');
const html = fs.readFileSync('c:/Users/pique/Desktop/organizador_compactador/index.html', 'utf8');

const idsToFind = [
    'section-upload', 'section-processing', 'section-results', 
    'file-input', 'drop-zone', 'status-text', 'status-sub', 
    'progress-container', 'progress-bar', 'progress-label', 
    'file-progress-container', 'file-progress-text', 'file-progress-bar', 
    'summary-text', 'preview-list', 'btn-generate', 'btn-report', 'btn-restart', 
    'search-input', 'sort-select', 'list-count', 'toast-container', 
    'modal-overlay', 'modal-list', 'save-badge'
];

let missingIds = [];
idsToFind.forEach(id => {
    if (!html.includes('id=\"' + id + '\"')) {
        missingIds.push(id);
    }
});

console.log('Missing IDs:', missingIds);
