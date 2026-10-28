// Optional test of the supplied scan. Keep the PDF outside the repository.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const {existsSync}=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');
// Heading positions were checked against the original PDF, independently of OCR.
const pages=[[1,[173,540,888]],[3,[110,547,881]],[19,[172,609]],[21,[112,498,778]],[37,[173,589,987]],[39,[112,514,881]],[55,[175,529,963]],[57,[111,580,942]],[75,[176,383,697,990]],[77,[111,358,964]],[95,[172,561,809]],[113,[172,486,678,929]],[125,[174,684,882]],[127,[112,340,552,913]],[145,[168,456,767]]];
test('actual concept pages: 47 complete concepts, no TIP/example problems',{timeout:600000},async(t)=>{
 assert(process.env.BOOK_PDF,'Set BOOK_PDF to the supplied TalkFile PDF');const root=path.join(__dirname,'..'),out=path.join(root,'test-results','concepts','integration');await fs.mkdir(out,{recursive:true});const html=await fs.readFile(path.join(root,'index.html'),'utf8');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});t.after(()=>browser.close());const p=await browser.newPage({acceptDownloads:true});p.setDefaultTimeout(180000);await p.setContent(html);await p.waitForFunction(()=>!state.busy&&state.plans?.length);await p.locator('#fileInput').setInputFiles(path.resolve(process.env.BOOK_PDF));await p.waitForFunction(()=>!state.busy&&state.pdf?.pages.length===160);await p.evaluate(()=>{state.conceptTestBlocks=[];state.conceptSample=[]});const report=[];
 for(const [n,ys]of pages)await t.test(`PDF page ${n}: ${ys.length} complete concepts`,async()=>{
  const result=await p.evaluate(async({n,ys})=>{
   const c=await pageCanvas(n),parts=await segment(c,'auto');if(parts.length!==ys.length)throw Error(`Expected ${ys.length} concepts on page ${n}, got ${parts.length}`);const scale=850/c.width,preview=canvas(850,c.height*scale),g=preview.getContext('2d');g.drawImage(c,0,0,preview.width,preview.height);g.strokeStyle='#008bd1';g.lineWidth=2;const records=[];
   for(let i=0;i<parts.length;i++){
    const a=parts[i],r=a.rect,small={x:r.x*scale,y:r.y*scale,w:r.w*scale,h:r.h*scale};g.strokeRect(small.x,small.y,small.w,small.h);
    // All dark main-body pixels in these independently bounded reference bands
    // must be inside the crop. Margin commentary is outside the reference area.
    const sx=Math.ceil(110/scale),sy=Math.ceil((ys[i]+40)/scale),ex=Math.floor(600/scale),ey=Math.floor((i+1<ys.length?ys[i+1]-18:1110)/scale),data=c.getContext('2d').getImageData(sx,sy,ex-sx,ey-sy).data;let missed=0;
    for(let y=0;y<ey-sy;y++)for(let x=0;x<ex-sx;x++){const z=(y*(ex-sx)+x)*4;if(Math.max(data[z],data[z+1],data[z+2])<145&&(sx+x<r.x||sx+x>=r.x+r.w||sy+y<r.y||sy+y>=r.y+r.h))missed++}
    const b=newBlock({...a,page:n,label:`개념 후보 · PDF ${n}`,sourceNumbers:[],selected:true});await freezeBlock(b,c,a.referenceWidth);b.audited=true;state.conceptTestBlocks.push(b);
    const im=await imageFromBlob(b.asset),copy=canvas(im.width,im.height),cg=copy.getContext('2d');cg.drawImage(im,0,0);const x=Math.floor(r.x),y=Math.floor(r.y),raw=c.getContext('2d').getImageData(x,y,im.width,im.height).data,actual=cg.getImageData(0,0,im.width,im.height).data,same=raw.every((v,i)=>v===actual[i]);im.close?.();releaseCanvas(copy);
    records.push({kind:a.kind,number:a.number,verified:a.verifiedConcept,rect:small,missed,pixelExact:same});
    if((n===1&&i===1)||(n===3&&[0,2].includes(i))||n===19||(n===21&&i===1))state.conceptSample.push(b);
   }
   const image=preview.toDataURL('image/jpeg',.86).split(',')[1];releaseCanvas(preview);return{page:n,parts:records,image};
  },{n,ys});
  assert.equal(result.parts.length,ys.length);for(let i=0;i<result.parts.length;i++){const b=result.parts[i];assert.equal(b.kind,'concept');assert(!b.number);assert(b.verified);assert(b.pixelExact);assert.equal(b.missed,0,`main body clipped on page ${n}, concept ${i+1}`);assert(b.rect.y<=ys[i]+2);assert(b.rect.x+b.rect.w>605);if(i+1<ys.length)assert(b.rect.y+b.rect.h<ys[i+1])}
  if(n===1)assert(result.parts[1].rect.y+result.parts[1].rect.h>845,'TIP was excluded');if(n===19){assert(result.parts[0].rect.y+result.parts[0].rect.h>560,'discontinuity graphs were excluded');assert(result.parts[1].rect.y+result.parts[1].rect.h>1110,'last worked example was excluded')}if(n===21)assert(result.parts[1].rect.y+result.parts[1].rect.h>640,'the extremum graph was cut');
  await fs.writeFile(path.join(out,`page-${n}.jpg`),Buffer.from(result.image,'base64'));delete result.image;report.push(result);await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 });
 assert.equal(report.flatMap(p=>p.parts).length,47);
 await t.test('complete concepts remain readable and do not reappear as problems when concepts are deselected',async()=>{
  const result=await p.evaluate(async()=>{state.blocks=state.conceptTestBlocks;state.active=null;await renderOutput();const full=state.plans.flatMap(p=>p.items).every(i=>i.columnSpan===2&&i.imageHeight+34<=i.height&&i.y+i.height<=PAPER.bottom+.01);$('conceptCheck').checked=false;await renderOutput();const excluded=state.plans.length===0;$('conceptCheck').checked=true;state.blocks=state.conceptSample;await renderOutput();return{count:state.conceptTestBlocks.length,sample:state.blocks.length,full,excluded,pages:state.plans.length}});assert.equal(result.count,47);assert(result.full&&result.excluded);assert.equal(result.sample,6);
  const pending=p.waitForEvent('download');await p.locator('#pdfBtn').click();await(await pending).saveAs(path.join(out,'concept-sample.pdf'));await p.waitForFunction(()=>!state.busy);await fs.writeFile(path.join(out,'concept-sample.json'),JSON.stringify(await p.evaluate(()=>projectSnapshot())));await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(result,null,2));
 });
});
