const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Fix PDF.js memory leak
const oldPdfCompress = /async compress\(pdfBytes, onProgress\) \{[\s\S]*?return new Uint8Array\(doc\.output\('arraybuffer'\)\);\s*\}/;
const newPdfCompress = `async compress(pdfBytes, onProgress) {
        const { jsPDF } = window.jspdf;
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        const doc = new jsPDF({ compress: true });
        doc.deletePage(1);

        for (let i = 1; i <= pdf.numPages; i++) {
            onProgress(\`Comprimindo PDF — página \${i} de \${pdf.numPages}...\`);
            const page     = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas   = document.createElement('canvas');
            canvas.width   = viewport.width;
            canvas.height  = viewport.height;
            
            const renderContext = { canvasContext: canvas.getContext('2d'), viewport };
            await page.render(renderContext).promise;
            
            const orientation = viewport.width > viewport.height ? 'l' : 'p';
            doc.addPage([viewport.width, viewport.height], orientation);
            doc.addImage(canvas.toDataURL('image/jpeg', 0.6), 'JPEG', 0, 0, viewport.width, viewport.height);
            
            // Release memory for each page to prevent OOM
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
        }

        const result = new Uint8Array(doc.output('arraybuffer'));
        pdf.destroy(); // Crucial to release worker memory
        return result;
    }`;

html = html.replace(oldPdfCompress, newPdfCompress);

// 2. Fix JSZip memory spikes by using STORE compression
// Inner ZIP (category)
html = html.replace(
    /compression: 'DEFLATE', compressionOptions: \{ level: 6 \}/g,
    `compression: 'STORE'`
);

// Master ZIP 
html = html.replace(
    /compression: 'DEFLATE', compressionOptions: \{ level: 3 \}/g,
    `compression: 'STORE'`
);

// 3. Clear file references as they are processed into inner zips
const oldInnerZipLoop = /const blob = await zip\.generateAsync\([\s\S]*?masterZip\.file\(zipName, blob\);\s*totalZips\+\+;\s*\}/;
const newInnerZipLoop = `const blob = await zip.generateAsync(
                        { type: 'blob', compression: 'STORE' },
                        meta => {
                            DOM.fileProgressBar.style.width = \`\${Math.round(meta.percent)}%\`;
                            if (meta.currentFile) DOM.fileProgressText.textContent = meta.currentFile;
                        }
                    );
                    masterZip.file(zipName, blob);
                    totalZips++;
                }

                // Liberta a memória RAM dos ficheiros originais deste aluno para evitar OOM
                for (const item of sFiles) {
                    item.file = null; 
                }`;

html = html.replace(oldInnerZipLoop, newInnerZipLoop);

fs.writeFileSync('index.html', html);
console.log('OOM Fix patched');
