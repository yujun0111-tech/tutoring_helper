const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {chromium}=require('playwright');
const pdf=process.env.RPM_PDF;

test('provided RPM: numbered questions, complete shared stems, number entry and PDF output', {skip:!pdf,timeout:600000},async t=>{
 const root=path.join(__dirname,'..'),html=await fs.readFile(path.join(root,'index.html'),'utf8'),expected=require('./fixtures/rpm-pages.json'),out=path.join(root,'test-results','rpm','integration');await fs.mkdir(out,{recursive:true});
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(pdf)).digest('hex'),expected.sourceHash,'use the supplied RPM edition for this reference');
 const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1500,height:1100}});page.setDefaultTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(html);await page.waitForFunction(()=>!state.busy&&state.plans?.length);await page.locator('#fileInput').setInputFiles(pdf);await page.waitForFunction(()=>!state.busy&&state.pdf?.pages.length===165);
 assert.equal(await page.evaluate(()=>state.pdf.bookProfile()),'rpm');await page.evaluate(()=>{state.rpmSample=[]});
 const sample=[1,3,10,18,25,37,54,70,87,96,120,145,193,194,200,300,415,580,700,850,962,1000,1100,1132],report=[];
 await t.test('all 165 pages yield exactly the printed questions 0001–1132 and zero concept fragments',async()=>{
  for(const [n,first,last]of expected.pages){
   const result=await page.evaluate(async({n,sample})=>{
    const c=await pageCanvas(n),parts=await segment(c,'auto',{book:'rpm',nativeHeaders:await state.pdf.numberHeaders(n-1),nativeItems:await state.pdf.pageItems(n-1)});
    const scale=850/c.width,proof=canvas(850,c.height*scale),g=proof.getContext('2d');g.drawImage(c,0,0,proof.width,proof.height);g.font='bold 13px sans-serif';g.lineWidth=1.5;
    for(const a of parts){const r=a.rect;g.strokeStyle='#087cb6';g.strokeRect(r.x*scale,r.y*scale,r.w*scale,r.h*scale);g.fillStyle='#07578b';g.fillText(a.number,r.x*scale,Math.max(14,r.y*scale-3));if(a.sharedRect){const q=a.sharedRect;g.strokeStyle='#8d30c0';g.strokeRect(q.x*scale,q.y*scale,q.w*scale,q.h*scale)}
     if(sample.includes(+a.number)){
      const b=newBlock({...a,page:n,label:a.number,selected:true,sourceNumbers:[a.number]});await freezeBlock(b,c,a.referenceWidth);b.audited=true;
      const im=await imageFromBlob(b.asset),copy=canvas(im.width,im.height),cx=copy.getContext('2d');cx.drawImage(im,0,0);im.close?.();
      const raw=c.getContext('2d'),actual=cx.getImageData(0,0,copy.width,copy.height).data;
      const equal=(rect,offset)=>{const x=Math.floor(rect.x),y=Math.floor(rect.y),w=Math.ceil(rect.x+rect.w)-x,h=Math.ceil(rect.y+rect.h)-y,source=raw.getImageData(x,y,w,h).data;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)for(let z=0;z<4;z++)if(source[(yy*w+xx)*4+z]!==actual[((yy+offset)*copy.width+xx)*4+z])return false;return true};
      const sh=a.sharedRect?Math.ceil(a.sharedRect.y+a.sharedRect.h)-Math.floor(a.sharedRect.y):0,gap=a.sharedRect?Math.max(4,Math.round(c.width/425)):0;
      b.pixelExact=equal(a.rect,sh+gap)&&(!a.sharedRect||equal(a.sharedRect,0));releaseCanvas(copy);state.rpmSample.push(b);
     }
    }
    const png=proof.toDataURL('image/jpeg',.8).split(',')[1];releaseCanvas(proof);return{page:n,parts,png};
   },{n,sample});
   assert.deepEqual(result.parts.map(a=>+a.number),first===null?[]:Array.from({length:last-first+1},(_,i)=>first+i),`PDF page ${n}`);
   for(const a of result.parts){assert.notEqual(a.kind,'concept');assert(a.rect.w>0&&a.rect.h>0);assert.equal(a.book,'rpm')}
   for(let i=0;i<result.parts.length;i++)for(let j=i+1;j<result.parts.length;j++){const a=result.parts[i].rect,b=result.parts[j].rect,overlapX=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),overlapY=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);assert(overlapX<=1||overlapY<=1,`page ${n}: adjacent questions overlap`)}
   if(result.parts.length||n<3)await fs.writeFile(path.join(out,`page-${String(n).padStart(3,'0')}.jpg`),Buffer.from(result.png,'base64'));delete result.png;report.push(result);if(n%20===0)console.log(`Checked ${n}/165 RPM pages`);
  }
  assert.equal(report.flatMap(p=>p.parts).length,1132);await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report));
 });
 await t.test('number input before extraction selects only 0003, 0018, 0025, keeps their stems and reports unavailable 9999',async()=>{
  await page.locator('#rangeInput').fill('2-4');await page.locator('#numberInput').fill('3, 18, 25, 9999');await page.locator('#analyzeBtn').click();await page.waitForFunction(()=>!state.busy&&state.blocks.length===25);
  assert.deepEqual(await page.evaluate(()=>chosen().map(b=>b.number)),['0003','0018','0025']);assert.equal(await page.locator('#blockList .block-card').count(),3);assert.match(await page.locator('#numberSelectionStatus').textContent(),/9999/);
  const r=await page.evaluate(async()=>{const saved=await projectSnapshot(),third=state.blocks.find(b=>b.number==='0003');await openProject(new Blob([JSON.stringify(saved)]));return{thirdShared:!!third.sharedRect,numbers:chosen().map(b=>b.number),imagesSame:JSON.stringify((await projectSnapshot()).blocks.map(b=>b.image))===JSON.stringify(saved.blocks.map(b=>b.image)),books:state.blocks.every(b=>b.book==='rpm')}});
  assert(r.thirdShared&&r.imagesSame&&r.books);assert.deepEqual(r.numbers,['0003','0018','0025']);
 });
 await t.test('native crop pixels, symbols and diagrams survive; sample PDF and the complete book keep at most two questions per column',async()=>{
  const result=await page.evaluate(async()=>{state.blocks=state.rpmSample;state.active=null;$('titleInput').value='RPM 공통수학 2 · 문제 모음';await renderOutput();const plans=makePlans(state.blocks,selectedSettings());return{pixelExact:state.blocks.every(b=>b.pixelExact),numbers:state.blocks.map(b=>+b.number),sampleLayout:plans.map(p=>p.items.map(i=>({number:i.b.number,column:i.slot>>1,span:i.span}))),pdf:await blobDataURL(new Blob([await pdfBytes(plans)],{type:'application/pdf'})),project:await projectSnapshot()}});
  assert(result.pixelExact);assert.deepEqual(result.numbers,sample);for(const items of result.sampleLayout){assert(items.length<=4);for(const col of [0,1])assert(items.filter(i=>i.column===col).length<=2)}
  const all=await page.evaluate(records=>makePlans(records.map(a=>({...a,width:a.rect.w,height:a.rect.h+(a.sharedRect?.h||0),sourceNumbers:[a.number]})),selectedSettings()).map(p=>p.items.map(i=>({column:i.slot>>1,span:i.span}))),report.flatMap(p=>p.parts));
  for(const items of all){assert(items.length<=4);for(const col of [0,1])assert(items.filter(i=>i.column===col).length<=2)}
  await fs.writeFile(path.join(out,'rpm-sample.pdf'),Buffer.from(result.pdf.split(',')[1],'base64'));await fs.writeFile(path.join(out,'rpm-sample.json'),JSON.stringify(result.project));
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({sourceHash:expected.sourceHash,appHash:crypto.createHash('sha256').update(html).digest('hex'),pages:165,questions:1132,sample:sample.length,pixelExact:true,allBookOutputPages:all.length,sampleLayout:result.sampleLayout},null,2));
 });
 assert.deepEqual(errors,[]);
});
