// Optional integration test against the user-supplied scan; the copyrighted PDF
// is deliberately not checked into the repository. BOOK_PDF must point to it.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
// PDF page numbers, independently checked chapter starts/ends. A-step excluded.
const chapters=[
 [5,18,44,131],[23,34,168,236],[41,54,270,366],
 [59,74,394,498],[79,94,527,628],[97,110,642,734],
 [115,124,758,826],[129,144,867,971],[147,160,986,1069]
];
const sample=[44,45,46,57,68,69,70,73,76,78,79,80,81,83,88,95,103,113,114,115,124,131,196,201,205,206,207,323,445,466,563,867,1010,1012,1033,1069];
test('actual 160-page scan: all 126 B/C-step pages, individual crops and 2×2 output',{timeout:900000},async(t)=>{
 assert(process.env.BOOK_PDF,'Set BOOK_PDF to the supplied TalkFile PDF before running npm run test:book');
 const pdf=path.resolve(process.env.BOOK_PDF),html=await fs.readFile(path.join(root,'index.html'),'utf8'),out=path.join(root,'test-results','book-integration');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});page.setDefaultTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(html);await page.waitForFunction(()=>!state.busy&&state.plans?.length);await page.locator('#fileInput').setInputFiles(pdf);await page.waitForFunction(()=>!state.busy&&state.pdf?.pages.length===160);
 await page.evaluate(()=>{state.realBookSample=[]});const report=[];
 for(const [first,last,begin,end]of chapters){
  await t.test(`PDF ${first}–${last}: questions ${begin}–${end}`,async()=>{
   const chapter=[];
   for(let n=first;n<=last;n++){
    const result=await page.evaluate(async({n,sample})=>{
     const c=await pageCanvas(n),parts=await segment(c,'auto',{nativeHeaders:await state.pdf.numberHeaders(n-1)}),scale=850/c.width;
     const annotated=canvas(850,c.height*scale),g=annotated.getContext('2d');g.drawImage(c,0,0,annotated.width,annotated.height);g.lineWidth=2;g.font='bold 16px sans-serif';
     const records=[];
     for(const a of parts){
      const r=a.rect;g.strokeStyle=a.number?'#008dd1':'#e33';g.fillStyle=g.strokeStyle;g.strokeRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);g.fillText(a.number||a.kind,r.x*scale,Math.max(18,r.y*scale-4));
      const x=Math.floor(r.x),y=Math.floor(r.y),width=Math.ceil(r.x+r.w)-x,height=Math.ceil(r.y+r.h)-y;
      records.push({...a,width,height,page:n});
      if(sample.includes(+a.number)){
       const b=newBlock({...a,page:n,label:a.number,sourceNumbers:[a.number],selected:true});await freezeBlock(b,c,a.referenceWidth);b.audited=true;
       // Compare the actual lossless PNG against its original source crop.
       const im=await imageFromBlob(b.asset),copy=canvas(width,height),cg=copy.getContext('2d');cg.drawImage(im,0,0);const expected=c.getContext('2d').getImageData(x,y,width,height).data,actual=cg.getImageData(0,0,width,height).data;
       b.pixelExact=expected.every((v,i)=>v===actual[i]);im.close?.();releaseCanvas(copy);state.realBookSample.push(b);
      }
     }
     const image=annotated.toDataURL('image/jpeg',.85).split(',')[1];releaseCanvas(annotated);return{page:n,width:c.width,height:c.height,parts:records,image};
    },{n,sample});
    await fs.writeFile(path.join(out,`source-${String(n).padStart(3,'0')}.jpg`),Buffer.from(result.image,'base64'));delete result.image;
    assert(result.parts.length>0,`page ${n} must contain questions`);
    for(const b of result.parts){assert(b.number,`page ${n} has a spurious/unread header`);assert.notEqual(b.kind,'concept');if(+b.number===79)assert((b.rect.x+b.rect.w)*850/result.width>=392,'end of the long formula in question 79 was clipped');if([201,205].includes(+b.number))assert(b.rect.h*850/result.width<200,'gutter or next type banner stretched the crop');if(+b.number===1012)assert((b.rect.x+b.rect.w)*850/result.width<800,'green chapter tab leaked into question 1012');assert(b.rect.w<result.width*.49,`page ${n}, ${b.number}: two source columns merged`);chapter.push(+b.number)}
    for(const col of [0,1]){const parts=result.parts.filter(b=>b.col===col).sort((a,b)=>a.rect.y-b.rect.y);for(let i=1;i<parts.length;i++)assert(parts[i-1].rect.y+parts[i-1].rect.h<=parts[i].rect.y+1,`overlapping crops on page ${n}`)}
    report.push(result);await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
   }
   assert.deepEqual(chapter,Array.from({length:end-begin+1},(_,i)=>begin+i),'missing, duplicate, misread or out-of-order question numbers');
  });
 }
 assert.equal(report.length,126);assert.equal(report.flatMap(p=>p.parts).length,812);
 await t.test('real crops preserve all pixels and fit at most two questions per column',async()=>{
  const layout=await page.evaluate(async()=>{
   const all=makePlans(state.realBookSample,selectedSettings());
   const geometry=makePlans(state.realBookSample.map(b=>({...b})),selectedSettings());
   for(const p of geometry)for(const item of p.items){if(item.columnSpan!==1||item.y+item.height>PAPER.bottom+.01)throw Error('A numbered question escaped its column')}
   for(const p of all){if(p.items.length>4)throw Error('Too many questions per page');for(let col=0;col<2;col++){const items=p.items.filter(i=>(i.slot>>1)===col);if(items.length>2)throw Error('Third question in a column')}}
   // Also validate the complete book's measured rectangles, without retaining
   // hundreds of decoded image bitmaps in memory.
   state.blocks=state.realBookSample;state.active=null;await renderOutput();
   return{numbers:state.blocks.map(b=>+b.number),pixelExact:state.blocks.every(b=>b.pixelExact),pages:all.length,tall:all.some(p=>p.items.some(i=>i.span===2)),layout:all.map(p=>p.items.map(i=>({number:i.b.number,slot:i.slot,span:i.span,columnSpan:i.columnSpan,width:i.width,height:i.height,imageHeight:i.imageHeight})))};
  });
  assert.deepEqual([...layout.numbers].sort((a,b)=>a-b),[...sample].sort((a,b)=>a-b));assert(layout.pixelExact);assert(layout.tall);
  const allLayout=await page.evaluate(records=>makePlans(records.map(a=>({...a,sourceNumbers:[a.number],referenceWidth:a.referenceWidth})),selectedSettings()).map(p=>p.items.map(i=>({number:i.b.number,slot:i.slot,span:i.span,columnSpan:i.columnSpan}))),report.flatMap(p=>p.parts));
  assert.equal(allLayout.flat().length,812);for(const items of allLayout){assert(items.length<=4);assert(items.every(i=>i.columnSpan===1));for(let col=0;col<2;col++)assert(items.filter(i=>(i.slot>>1)===col).length<=2)}
  const pending=page.waitForEvent('download');await page.locator('#pdfBtn').click();await(await pending).saveAs(path.join(out,'actual-book-sample.pdf'));await page.waitForFunction(()=>!state.busy);
  const pdfBytes=await fs.readFile(path.join(out,'actual-book-sample.pdf'));assert.equal(pdfBytes.subarray(0,8).toString(),'%PDF-1.4');
  const project=await page.evaluate(()=>projectSnapshot());await fs.writeFile(path.join(out,'actual-book-sample.json'),JSON.stringify(project));
  const sourceHash=crypto.createHash('sha256').update(await fs.readFile(pdf)).digest('hex');const appHash=crypto.createHash('sha256').update(html).digest('hex');
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({sourceHash,appHash,sourcePages:160,testedPages:126,excluded:'A-step and divider pages',questions:812,sampleQuestions:sample.length,samplePages:layout.pages,samplePixelExact:layout.pixelExact,allBookOutputPages:allLayout.length,layout:layout.layout},null,2));
 });
 assert.deepEqual(errors,[]);
});
