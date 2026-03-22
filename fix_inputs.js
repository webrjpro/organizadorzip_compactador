const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(targetPath, 'utf8');

const regex = /row\.innerHTML = '<span class="w-3 h-3 rounded-full flex-shrink-0" style="background:' \+ col\.dot \+ '"><\/span>' \+[\s\S]*?'<\/button>' : '<div class="w-6 flex-shrink-0"><\/div>'\);/s;

const newHTML = `row.innerHTML = '<span class="w-3 h-3 rounded-full flex-shrink-0" style="background:' + col.dot + '"></span>' +
                '<input type="text" value="' + Utils.esc(cat.name) + '" data-idx="' + i + '" ' + readonlyAttr +
                ' class="cat-input flex-1 ' + (cat.isFallback ? 'opacity-50 cursor-not-allowed' : '') + '"' +
                ' placeholder="Nome da pasta">' +
                (cat.isFallback ? hiddenMsg : 
                '<input type="text" value="' + Utils.esc((cat.keywords || []).join(', ')) + '" data-idx="' + i + '" data-type="kw"' +
                ' class="cat-input flex-1 text-indigo-200"' +
                ' placeholder="palavras-chave separadas por vírgula">') +
                (!cat.isFallback ? 
                '<button class="btn-del-cat flex-shrink-0" onclick="removeNomenclatureCategory(' + i + ')" title="Remover categoria">' +
                '<i data-lucide="trash-2" class="w-4 h-4"></i>' +
                '</button>' : '<div class="w-6 flex-shrink-0"></div>');`;

if (rxMatch = html.match(regex)) {
    html = html.replace(regex, newHTML);
    fs.writeFileSync(targetPath, html);
    console.log("Input styles updated!");
} else {
    console.log("Could not find the row.innerHTML assignment block.");
}
