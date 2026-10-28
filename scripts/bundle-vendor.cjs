const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),assets={},manifest={};
function add(key,rel){const data=fs.readFileSync(path.join(root,'node_modules',rel));assets[key]=zlib.gzipSync(data,{level:9}).toString('base64');manifest[key]={bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')}}
add('pdfMain','pdfjs-dist/build/pdf.min.mjs');add('pdfWorker','pdfjs-dist/build/pdf.worker.min.mjs');
add('ocrMain','tesseract.js/dist/tesseract.min.js');add('ocrWorker','tesseract.js/dist/worker.min.js');add('ocrCore','tesseract.js-core/tesseract-core-lstm.wasm.js');add('ocrEnglish','@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz');
for(const [dir,prefix,ext] of [['cmaps','cMapUrl','.bcmap'],['standard_fonts','standardFontDataUrl',null],['wasm','wasmUrl','.wasm']]){
 for(const file of fs.readdirSync(path.join(root,'node_modules/pdfjs-dist',dir)))if(!file.startsWith('LICENSE')&&(!ext||file.endsWith(ext)))add(prefix+'/'+file,'pdfjs-dist/'+dir+'/'+file);
}
const marker='/* FOLIO_VENDOR_START */',end='/* FOLIO_VENDOR_END */',file=path.join(root,'index.html');let html=fs.readFileSync(file,'utf8');
const payload=marker+'\nconst FOLIO_VENDOR='+JSON.stringify(assets)+';\n'+end;
if(html.includes(marker)){const a=html.indexOf(marker),b=html.indexOf(end,a)+end.length;html=html.slice(0,a)+payload+html.slice(b)}else html=html.replace("'use strict';","'use strict';\n"+payload);
fs.writeFileSync(file,html);
const versions=Object.fromEntries(['pdfjs-dist','tesseract.js','tesseract.js-core','@tesseract.js-data/eng'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'))).version]));
fs.writeFileSync(path.join(root,'vendor-manifest.json'),JSON.stringify({versions,assets:manifest},null,2)+'\n');
const notices=[['PDF.js','pdfjs-dist/LICENSE'],['Tesseract.js','tesseract.js/LICENSE.md'],['Tesseract.js core','tesseract.js-core/LICENSE'],['PDF.js CMaps','pdfjs-dist/cmaps/LICENSE'],['PDF.js standard fonts (Foxit)','pdfjs-dist/standard_fonts/LICENSE_FOXIT'],['PDF.js standard fonts (Liberation)','pdfjs-dist/standard_fonts/LICENSE_LIBERATION']];
for(const f of fs.readdirSync(path.join(root,'node_modules/pdfjs-dist/wasm')))if(f.startsWith('LICENSE'))notices.push([f,'pdfjs-dist/wasm/'+f]);
let noticeText=notices.map(([name,rel])=>name+'\n'+fs.readFileSync(path.join(root,'node_modules',rel),'utf8')).join('\n\n');
const modelLicense=path.join(__dirname,'tessdata-LICENSE.txt');if(fs.existsSync(modelLicense))noticeText+='\n\nTesseract English traineddata (@tesseract.js-data/eng)\n'+fs.readFileSync(modelLicense,'utf8');
fs.writeFileSync(path.join(root,'THIRD_PARTY_NOTICES.txt'),noticeText);
const noticeTag='<script type="text/plain" id="folio-licenses">'+noticeText.replace(/<\/script/gi,'<\\/script')+'</script>';
if(html.includes('id="folio-licenses"'))html=html.replace(/<script type="text\/plain" id="folio-licenses">[\s\S]*?<\/script>/,noticeTag);
else{const location=html.lastIndexOf('</div>',html.indexOf('<script data-folio-runtime='));html=html.slice(0,location)+noticeTag+'\n'+html.slice(location)}
fs.writeFileSync(file,html);
console.log('Embedded',Object.keys(assets).length,'offline assets; HTML',Buffer.byteLength(html),'bytes;',versions);
