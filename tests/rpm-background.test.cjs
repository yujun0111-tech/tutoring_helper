const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const {deflateSync}=require('node:zlib');
const {chromium}=require('playwright');

// Foreground-only reference is a separate PDF. Gray frame, math bars, graph,
// an opaque email and even a small use of the same faint image must all survive.
function fixture({background=true,stamps=true,alpha=13}={}){
 const w=60,h=84,rgb=Buffer.alloc(w*h*3),mask=Buffer.alloc(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x;rgb[k*3]=0;rgb[k*3+1]=105;rgb[k*3+2]=125;mask[k]=(x+y)%24<12?alpha:0}
 const content=[background?'q 600 0 0 840 0 0 cm /Im0 Do Q':'',
  stamps?'/OC /WM BDC BT /F1 44 Tf .84 g 55 80 Td (BACKGROUND) Tj ET EMC':'',
  '0 g BT /F1 14 Tf 30 810 Td (RPM) Tj ET',
  'BT /F1 13.5608 Tf 50 740 Td (0018) Tj ET',
  'BT /F1 12 Tf 50 715 Td (Find x. f\(x\) = 1 / 2.) Tj ET',
  'q .9 G 1 w 48 600 300 80 re S 70 640 m 140 640 l S Q',
  'q .85 G 1 w 65 530 m 300 530 l S 150 500 m 150 585 l S [3 4] 0 d 180 510 m 270 575 l S Q',
  'q 60 0 0 84 380 520 cm /Im0 Do Q',
  '0 g BT /F1 9 Tf 50 480 Td (contact@example.invalid) Tj ET',
  'q /Faint gs BT /F1 9 Tf 50 455 Td (a@b) Tj ET Q',
  stamps?'q /Faint gs BT /F1 9 Tf 60 200 Td (stamp@example.invalid) Tj ET Q':''].join('\n');
 const stream=(dict,b)=>Buffer.concat([Buffer.from(`<< ${dict} /Length ${b.length} >>\nstream\n`),b,Buffer.from('\nendstream')]);
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [8 0 R] /D << /Order [8 0 R] /ON [8 0 R] >> >> >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> /Properties << /WM 8 0 R >> /ExtGState << /Faint 9 0 R >> >> /Contents 4 0 R >>',stream('',Buffer.from(content)),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',stream('/Type /XObject /Subtype /Image /Width 60 /Height 84 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 7 0 R /Filter /FlateDecode',deflateSync(rgb)),stream('/Type /XObject /Subtype /Image /Width 60 /Height 84 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode',deflateSync(mask)),'<< /Type /OCG /Name (Watermark) >>','<< /Type /ExtGState /ca .2 >>'];
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[0];let len=parts[0].length;
 for(let i=1;i<objects.length;i++){offsets[i]=len;const b=Buffer.concat([Buffer.from(`${i} 0 obj\n`),Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);parts.push(b);len+=b.length}
 parts.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF`));return Buffer.concat(parts).toString('base64');
}

test('RPM document backgrounds do not enter crops; legitimate pale math/graphics stay intact', {timeout:120000},async t=>{
 const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});t.after(()=>browser.close());
 const page=await browser.newPage();page.setDefaultTimeout(60000);await page.setContent(await fs.readFile(path.join(__dirname,'..','index.html'),'utf8'));await page.waitForFunction(()=>!state.busy&&state.plans?.length);
 await t.test('background exclusions match a separately constructed foreground-only PDF pixel for pixel',async()=>{
  const r=await page.evaluate(async({source,reference})=>{
   const doc=await PDFSource.open(bytes64(source)),ref=await PDFSource.open(bytes64(reference)),clean=await doc.render(0),expected=await ref.render(0,{includeBackground:true}),original=await doc.render(0,{includeBackground:true}),again=await doc.render(0);
   const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data,a=pixels(clean),b=pixels(expected),raw=pixels(original),repeat=pixels(again);
   let changed=0;for(let i=0;i<a.length;i+=4)changed+=a[i]!==raw[i]||a[i+1]!==raw[i+1]||a[i+2]!==raw[i+2];
   const options={book:'rpm',nativeHeaders:await doc.numberHeaders(0),nativeItems:await doc.pageItems(0)},cleanParts=await segment(clean,'1',options),rawParts=await segment(original,'1',options);
   const result={same:a.every((v,i)=>v===b[i]),repeat:a.every((v,i)=>v===repeat[i]),changed,info:doc.backgroundReport.get(0),cleanParts,rawParts};for(const c of [clean,expected,original,again])releaseCanvas(c);await doc.destroy();await ref.destroy();return result;
  },{source:fixture(),reference:fixture({background:false,stamps:false})});
  assert(r.same,'foreground including pale vector/raster graphics must match the independent reference');assert(r.repeat,'render cache must retain the same result');assert(r.changed>10000);assert.equal(r.info.images,1);assert.equal(r.info.texts,1);assert.deepEqual(r.cleanParts.map(p=>p.number),['0018']);assert(r.cleanParts[0].rect.h<r.rawParts[0].rect.h*.8,'the decorative text must not stretch the crop');
 });
 await t.test('a streamed chunk ending in the contact stamp behaves like a complete operator list',async()=>{
  const r=await page.evaluate(async()=>{const api=await pdfEngine(),fake={getViewport:()=>({width:600,height:840})},make=()=>{const report={images:0,texts:0};return{report,filter:rpmBackgroundFilter(fake,api,new Map(),report)}},full=make(),chunks=make(),glyphs=[..."stamp@example.invalid"].map(unicode=>({unicode})),list={fnArray:[api.OPS.setGState,api.OPS.showText,api.OPS.endText],argsArray:[[[["ca",.2]]],[glyphs],null]},streamed={fnArray:list.fnArray.slice(0,2),argsArray:list.argsArray.slice(0,2)};const a=list.fnArray.map((_,i)=>full.filter(i,list)),b=streamed.fnArray.map((_,i)=>chunks.filter(i,streamed));streamed.fnArray.push(api.OPS.endText);streamed.argsArray.push(null);b.push(chunks.filter(2,streamed));return{a,b,full:full.report.texts,chunks:chunks.report.texts}});
  assert.deepEqual(r.a,[true,false,true]);assert.deepEqual(r.b,r.a);assert.equal(r.full,1);assert.equal(r.chunks,1);
 });
 await t.test('opaque page images and explicitly selected non-RPM rendering are retained',async()=>{
  const r=await page.evaluate(async({opaque,faint})=>{const a=await PDFSource.open(bytes64(opaque)),b=await PDFSource.open(bytes64(faint));const clean=await a.render(0),raw=await a.render(0,{includeBackground:true}),forced=await b.render(0,{profile:'ssen'}),original=await b.render(0,{includeBackground:true});const eq=(a,b)=>{const x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;return x.every((v,i)=>v===y[i])};const result={opaqueSame:eq(clean,raw),unrelatedSame:eq(forced,original),info:a.backgroundReport.get(0)};for(const c of [clean,raw,forced,original])releaseCanvas(c);await a.destroy();await b.destroy();return result},{opaque:fixture({alpha:255,stamps:false}),faint:fixture()});
  assert(r.opaqueSame&&r.unrelatedSame);assert.equal(r.info.images,0);
 });
});
