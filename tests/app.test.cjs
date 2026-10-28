const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile,mkdir,writeFile}=require('node:fs/promises');
const {existsSync}=require('node:fs');
const {createServer}=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

// A scanned, two-column PDF: wide/short problems share exactly the same text size.
async function fixturePDF(page){
 return page.evaluate(async()=>{
  const w=1700,h=2400,c=canvas(w,h),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);
  function problem(x,y,n,short){
   g.fillStyle='#dd761f';g.fillRect(x,y,195,48);g.fillStyle='#fff';g.font='bold 34px sans-serif';g.fillText(n,x+9,y+36);
   g.fillStyle='#ededed';g.fillRect(x+2,y+80,short?315:645,52);
   g.fillStyle='#171717';g.font='32px serif';g.fillText(short?'lim (x + 1) = ?':'Find the limit of f(x) as x approaches 3.',x+8,y+119);
   if(!short){g.fillText('f(x) = (x - 3) / (x + 1)',x+8,y+180);g.fillText('1) -2     2) 0     3) 1     4) 3',x+8,y+240)}
  }
  problem(80,120,'0057',false);problem(80,1250,'0068',true);problem(900,120,'0062',false);problem(900,1250,'0073',true);
  // A diagram must survive cleanup; a detached outer rule must not.
  g.strokeStyle='#333';g.lineWidth=3;g.beginPath();g.moveTo(490,420);g.lineTo(700,420);g.moveTo(530,340);g.lineTo(530,610);g.moveTo(495,580);g.lineTo(680,355);g.stroke();
  g.strokeStyle='#b4b4b4';g.lineWidth=2;g.beginPath();g.moveTo(73,1230);g.lineTo(73,1720);g.stroke();
  const rgba=g.getImageData(0,0,w,h).data,rgb=new Uint8Array(w*h*3);for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2]}
  const pixels=new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;
  const push=b=>{const d=typeof b==='string'?enc.encode(b):b;parts.push(d);length+=d.length};
  const obj=(id,b)=>{offsets[id]=length;push(`${id} 0 obj\n${b}\nendobj\n`)};
  push('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Count 21 /Kids [${Array.from({length:21},(_,i)=>`${4+i*2} 0 R`).join(' ')}] >>`);
  offsets[3]=length;push(`3 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`);push(pixels);push('\nendstream\nendobj\n');
  for(let i=0;i<21;i++){const id=4+i*2,cmd='q 595 0 0 842 0 0 cm /Im0 Do Q\n';obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 3 0 R >> >> /Contents ${id+1} 0 R >>`);obj(id+1,`<< /Length ${cmd.length} >>\nstream\n${cmd}endstream`)}
  const start=length;push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
  return(await blobDataURL(new Blob(parts,{type:'application/pdf'}))).split(',')[1];
 });
}

function vectorFixture(){
 const content='q\n0.2 0.5 0.15 rg BT /F1 20 Tf 40 780 Td (0078) Tj ET\n0.8 G 0.5 w [4 2] 0 d 40 580 300 150 re S\n0 g BT /F1 12 Tf 55 710 Td (A boxed formula with a transparent image.) Tj ET\nq 100 0 0 100 80 600 cm /Im0 Do Q\n0.15 0.35 0.7 rg BT /F1 20 Tf 40 400 Td (0079) Tj ET\n0 g BT /F1 12 Tf 40 360 Td (Second question.) Tj ET\nQ\n';
 const alpha=Buffer.from(Array.from({length:64},(_,i)=>{const x=i%8,y=i>>3;return x>=2&&x<=5&&y>=2&&y<=5?255:0}));
 const stream=(dict,bytes)=>Buffer.concat([Buffer.from(`<< ${dict} /Length ${bytes.length} >>\nstream\n`),bytes,Buffer.from('\nendstream')]);
 const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> >> /Contents 4 0 R >>',stream('',Buffer.from(content)),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',stream('/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 7 0 R',Buffer.alloc(8*8*3)),stream('/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8',alpha)];
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[0];let len=parts[0].length;for(let i=1;i<objects.length;i++){offsets[i]=len;const bytes=Buffer.concat([Buffer.from(`${i} 0 obj\n`),Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);parts.push(bytes);len+=bytes.length}
 parts.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF`));return Buffer.concat(parts);
}

test('scanned PDF → 21-page analysis → consistent 2×2 worksheets → PDF and saved project', {timeout:300000}, async(t)=>{
 const html=await readFile(path.join(__dirname,'..','index.html'));
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>!state.busy&&state.plans?.length);
 await t.test('startup uses blue, no name/date fields, and limits every column to two slots',async()=>{
  assert.equal(await page.locator('#themeInput').inputValue(),'navy');assert.equal(await page.locator('#layoutInput').count(),0);assert.equal(await page.locator('#gapInput').count(),0);
  assert.equal(await page.locator('#blockList .block-card').count(),6);
  assert.equal(await page.evaluate(()=>state.plans.every(p=>p.items.length<=4&&p.items.every(x=>x.y+x.height<=PAPER.bottom+.01))),true);
 });
 await t.test('prominent new-tab control opens a working copy with the current project',async()=>{
  assert(await page.locator('#launchBtn').isVisible());assert(await page.locator('#downloadAppBtn').isVisible());
  const pending=page.waitForEvent('popup');await page.locator('#launchBtn').click();const popup=await pending;
  try{await popup.waitForFunction(()=>typeof state!=='undefined'&&!state.busy&&state.plans?.length);assert.equal(await popup.evaluate(()=>state.blocks.length),6);assert.equal(await popup.locator('#titleInput').inputValue(),await page.locator('#titleInput').inputValue())}finally{await popup.close()}
 });
 await t.test('blocked popups show persistent browser instructions and offer a complete HTML download',async()=>{
  await page.evaluate(async()=>{window.savedWindowOpen=window.open;window.open=()=>null});
  await page.locator('#launchBtn').click();assert.equal(await page.locator('#browserHelp').getAttribute('open'),'');assert((await page.locator('#browserHint').textContent()).includes('Chrome'));
  const pending=page.waitForEvent('download');await page.locator('#downloadAppBtn').click();const download=await pending;await mkdir(path.join(__dirname,'..','test-results'),{recursive:true});const file=path.join(__dirname,'..','test-results','standalone-app.html');await download.saveAs(file);await page.waitForFunction(()=>!state.busy);
  const other=await browser.newPage();try{await other.setContent(await readFile(file,'utf8'));await other.waitForFunction(()=>!state.busy&&state.plans?.length);assert.equal(await other.evaluate(()=>state.blocks.length),6)}finally{await other.close();await page.evaluate(async()=>{window.open=window.savedWindowOpen})}
 });
 await t.test('200% preview renders enough pixels for a 2x screen and redraws when zoom changes',async()=>{
  const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:2}),retina=await context.newPage();
  try{
   await retina.goto(`http://127.0.0.1:${server.address().port}`);await retina.waitForFunction(()=>!state.busy&&state.plans?.length);
   assert.equal(await retina.evaluate(()=>state.pages[0].width),await retina.evaluate(()=>Math.round(state.pages[0].getBoundingClientRect().width*devicePixelRatio)));
   await retina.locator('#zoomInput').selectOption('200');await retina.waitForFunction(()=>{const c=state.pages[0];return c?.width>=Math.round(c.getBoundingClientRect().width*devicePixelRatio)&&c.dataset.scale==='4'});
   assert.equal(await retina.evaluate(()=>state.pages[0].width),3176);
   await retina.locator('#zoomInput').selectOption('100');await retina.waitForFunction(()=>state.pages[0].dataset.scale==='2');assert.equal(await retina.evaluate(()=>state.pages[0].width),1588);
  }finally{await context.close()}
 });
 await t.test('native crop pixels and fine gray stroke edges survive cleanup and 300 DPI placement',async()=>{
  const result=await page.evaluate(async()=>{
   const c=canvas(240,160),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,240,160);
   g.fillStyle='#111';g.fillRect(50,45,90,1);g.fillStyle='#d2d2d2';g.fillRect(50,46,90,1);g.fillStyle='#999';g.fillRect(60,60,1,35);
   const b=newBlock({kind:'apply',rect:{x:20,y:20,w:180,h:120},label:'sharpness'});await freezeBlock(b,c,1062.5);
   const raw=await cropCanvas(b,false),copy=canvas(raw.width,raw.height),cg=copy.getContext('2d');cg.drawImage(raw,0,0);const expected=g.getImageData(20,20,180,120).data,actual=cg.getImageData(0,0,180,120).data;
   const nativeEqual=expected.every((v,i)=>v===actual[i]),clean=await cropCanvas(b,true);cg.clearRect(0,0,180,120);cg.drawImage(clean,0,0);const edge=[...cg.getImageData(45,26,1,1).data],thin=[...cg.getImageData(40,55,1,1).data];
   const plan=makePlans([b],selectedSettings())[0],printed=await drawPage(plan,3.125),item=plan.items[0],px=Math.round(item.x*3.125)+30,py=Math.round((item.y+29)*3.125)+25;
   const printedStroke=[...printed.getContext('2d').getImageData(px,py,1,1).data];releaseCanvas(c);releaseCanvas(copy);releaseCanvas(printed);return{nativeEqual,edge,thin,printedStroke};
  });
  assert(result.nativeEqual);assert.deepEqual(result.edge,[210,210,210,255]);assert.deepEqual(result.thin,[153,153,153,255]);assert.deepEqual(result.printedStroke,[17,17,17,255]);
 });
 await t.test('concept extraction excludes the separated side commentary without cutting the main text',async()=>{
  const result=await page.evaluate(async()=>{
   const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);
   for(const y of [80,650]){g.fillStyle='#e37822';g.fillRect(50,y,50,22);g.fillStyle='#fff';g.font='bold 14px sans-serif';g.fillText(y===80?'01-2':'01-4',52,y+17);g.fillStyle='#171717';g.font='20px serif';g.fillText('Concept: one-sided limits and continuity',50,y+65);g.fillText('lim f(x) = L,  x approaches a.',50,y+115);g.strokeStyle='#b4b4b4';g.lineWidth=1;g.beginPath();g.moveTo(650,y);g.lineTo(650,y+400);g.stroke();g.fillStyle='#333';g.font='14px serif';g.fillText('Side note',680,y+100);g.fillText('Extra details',680,y+160)}
   const blocks=await segment(c,'1');releaseCanvas(c);return blocks.map(b=>({kind:b.kind,right:b.rect.x+b.rect.w,ref:b.referenceWidth}));
  });
  assert.equal(result.length,2);assert(result.every(b=>b.kind==='concept'&&b.right<650&&b.right>350&&b.ref<650));
 });
 await t.test('wide concepts use a full row instead of shrinking text into a question cell',async()=>{
  const result=await page.evaluate(async()=>{
   const concept={kind:'concept',verifiedConcept:true,width:1500,height:600,referenceWidth:1500,bodyHeight:30},problem={kind:'apply',width:800,height:350,referenceWidth:800,bodyHeight:28};const plans=makePlans([concept,problem,{...problem}],selectedSettings()),item=plans[0].items[0];
   return{pages:plans.length,count:plans[0].items.length,columnSpan:item.columnSpan,glyph:concept.bodyHeight*item.scale,width:item.width,all:plans[0].items.every(x=>x.y+x.height<=PAPER.bottom+.01)};
  });
  assert.equal(result.pages,1);assert.equal(result.count,3);assert.equal(result.columnSpan,2);assert(result.glyph>=12);assert.equal(result.width,704);assert(result.all);
 });
 await t.test('range parsing supports 20+ pages and rejects malformed input',async()=>{
  const result=await page.evaluate(()=>({all:parseRange('1-21',21),deduplicated:parseRange('1-20, 3, 21',21),bad:['0','22','3-1','a','1,,2'].map(x=>{try{parseRange(x,21);return false}catch{return true}})}));
  assert.equal(result.all.length,21);assert.equal(result.deduplicated.length,21);assert(result.bad.every(Boolean));
 });
 await t.test('a partial-height margin rule cannot stretch a crop into the next problem number',async()=>{
  const result=await page.evaluate(async()=>{
   const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);
   g.strokeStyle='#555';g.lineWidth=1;g.beginPath();g.moveTo(30,80);g.lineTo(30,720);g.stroke();
   for(const y of [80,700]){g.fillStyle='#dc7825';g.fillRect(48,y,160,24);g.fillStyle='#fff';g.font='bold 18px sans-serif';g.fillText(y===80?'0103':'0104',53,y+19);g.fillStyle='#151515';g.font='22px serif';g.fillText('Find the limit of f(x).',48,y+65)}
   // A separate diagram is part of the first problem and must stay in the crop.
   g.strokeStyle='#222';g.lineWidth=2;g.beginPath();g.moveTo(300,220);g.lineTo(300,400);g.moveTo(250,350);g.lineTo(470,350);g.moveTo(815,220);g.lineTo(815,400);g.stroke();
   const blocks=await segment(c,'1');return blocks.map(b=>({end:b.rect.y+b.rect.h,endX:b.rect.x+b.rect.w,start:b.rect.y,kind:b.kind}));
  });
  assert.equal(result.length,2);assert(result[0].end>400,'keep the full diagram');assert(result[0].endX>815,'keep the outer edge of a diagram');assert(result[0].end<430,'exclude the margin rule and the following header');assert(result[0].end<result[1].start);
 });
 await t.test('bold green 0078/0079 with orange/blue difficulty markers are two complete problems',async()=>{
  const result=await page.evaluate(async()=>{
   const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);
   for(const [y,n,color] of [[90,'0078','#e87b27'],[650,'0079','#5685c5']]){
    g.fillStyle='#34742c';g.font='900 30px sans-serif';g.fillText(n,50,y+29);
    g.fillStyle=color;g.beginPath();g.arc(148,y+17,11,0,Math.PI*2);g.fill();g.beginPath();g.arc(170,y+17,3,0,Math.PI*2);g.fill();
    g.fillStyle='#151515';g.font='24px serif';g.fillText('lim f(x) = 3. Find the answer.',50,y+83);
   }
   return (await segment(c,'1')).map(b=>({kind:b.kind,start:b.rect.y,end:b.rect.y+b.rect.h,w:b.rect.w}));
  });
  assert.equal(result.length,2);assert(result.every(x=>x.kind==='apply'));assert(result[0].end<result[1].start);assert(result[0].end<250);assert(result[1].start<680&&result[1].end>720);
 });
 await t.test('real number OCR splits touching green digits, blue digits and red digits without widening questions',async()=>{
  const result=await page.evaluate(async()=>{
   const out=[];
   for(const [numbers,color] of [[['0078','0079'],'#34742c'],[['0113','0114','0115'],'#2a65b5'],[['0132','0133'],'#cb593b']]){
    const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);
    numbers.forEach((n,i)=>{const y=60+i*360;g.save();g.translate(50,y);g.scale(.76,1);g.fillStyle=color;g.font='900 38px sans-serif';g.fillText(n,0,40);g.restore();g.fillStyle='#111';g.font='22px serif';g.fillText('Find the limit of this function.',50,y+100);g.strokeStyle='#d4d4d4';g.lineWidth=1;g.strokeRect(50,y+130,500,90);g.fillText('f(x) = (x + 1) / (x - 1)',65,y+175)});
    const parts=await segment(c,'1');out.push({expected:numbers,numbers:parts.map(p=>p.number),kinds:parts.map(p=>p.kind),heights:parts.map(p=>p.rect.h)});releaseCanvas(c);
   }return out;
  });
  for(const row of result){assert.deepEqual(row.numbers,row.expected);assert(row.kinds.every(x=>x!=='concept'));assert(row.heights.every(h=>h<300))}
 });
 await t.test('legacy merged assets are re-audited: 69/70, 78/79 and 113/114/115 become individual narrow problems',async()=>{
  const cases=await page.evaluate(async()=>{
   const results=[];
   for(const numbers of [['0069','0070'],['0078','0079'],['0113','0114','0115']]){
    const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);
    numbers.forEach((n,i)=>{const y=50+i*350;g.fillStyle=n.startsWith('01')?'#2b67b6':'#35772c';g.font='900 68px sans-serif';g.fillText(n,50,y+60);g.fillStyle='#111';g.font='22px serif';g.fillText('A separate question with its own answer.',50,y+125)});
    const project={format:'folio-lesson-v2',settings:selectedSettings(),blocks:[{kind:'concept',group:1,page:1,label:'개념 후보',selected:true,referenceWidth:800,image:c.toDataURL('image/png')}]};releaseCanvas(c);await openProject(new Blob([JSON.stringify(project)]));
    results.push({expected:numbers,numbers:state.blocks.map(b=>b.number),kinds:state.blocks.map(b=>b.kind),single:state.blocks.every(b=>b.sourceNumbers.length===1),maxPerColumn:Math.max(...state.plans.flatMap(p=>[0,1].map(col=>p.items.filter(x=>(x.slot>>1)===col).length))),narrow:state.plans.every(p=>p.items.every(x=>x.columnSpan===1))});
   }return results;
  });
  for(const row of cases){assert.deepEqual(row.numbers,row.expected);assert(row.kinds.every(x=>x!=='concept'));assert(row.single&&row.narrow);assert(row.maxPerColumn<=2)}
 });
 await t.test('section labels stop the preceding crop and do not become empty concept pages',async()=>{
  const result=await page.evaluate(async()=>{
   const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);
   for(const [y,n] of [[60,'0081'],[600,'0082']]){g.fillStyle='#35772b';g.font='900 30px sans-serif';g.fillText(n,50,y+30);g.fillStyle='#111';g.font='22px serif';g.fillText('Find the correct answer.',50,y+90)}
   g.fillStyle='#36764a';g.fillRect(50,450,52,25);g.fillStyle='#fff';g.font='bold 18px sans-serif';g.fillText('09',62,470);
   g.fillStyle='#e78025';g.fillRect(50,1000,55,24);g.fillStyle='#fff';g.font='bold 15px sans-serif';g.fillText('02-1',52,1019);g.fillStyle='#111';g.font='20px serif';g.fillText('Continuity',125,1019);
   const parts=await segment(c,'1');releaseCanvas(c);return parts.map(p=>({number:p.number,kind:p.kind,end:p.rect.y+p.rect.h}));
  });
  assert.deepEqual(result.map(p=>p.number),['0081','0082']);assert(result[0].end<300);assert(result[1].end<800);
 });
 await t.test('PDF.js renders vector text, dashed pale boxes and image soft masks; native numbers remain separate',async()=>{
  const result=await page.evaluate(async(base64)=>{
   const source=await PDFSource.open(bytes64(base64)),image=await source.render(0),g=image.getContext('2d'),headers=await source.numberHeaders(0),parts=await segment(image,'1',{nativeHeaders:headers}),s=300/72;
   const at=(x,y)=>[...g.getImageData(Math.round(x*s),Math.round((842-y)*s),1,1).data];
   let border=0;for(let x=45;x<330;x++)if(at(x,730)[0]<245)border++;
   const answer={headers:headers.map(h=>h.number),parts:parts.map(p=>p.number),transparent:at(85,605),opaque:at(130,650),border};releaseCanvas(image);await source.destroy();return answer;
  },vectorFixture().toString('base64'));
  assert.deepEqual(result.headers,['0078','0079']);assert.deepEqual(result.parts,['0078','0079']);assert(result.transparent[0]>245);assert(result.opaque[0]<20);assert(result.border>80&&result.border<270);
  await page.locator('#fileInput').setInputFiles({name:'vector-box.pdf',mimeType:'application/pdf',buffer:vectorFixture()});await page.waitForFunction(()=>!state.busy&&state.pdf?.pages.length===1);
 });
 await t.test('faint complete rectangle borders survive byte-for-byte, and numbered concepts cannot span the page',async()=>{
  const result=await page.evaluate(async()=>{const c=canvas(600,400),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,600,400);g.strokeStyle='#d6d6d6';g.lineWidth=1;g.strokeRect(5.5,5.5,580,380);g.fillStyle='#222';g.font='22px serif';g.fillText('A formula inside the rectangle',30,100);const b=newBlock({kind:'concept',number:'0083',sourceNumbers:['0083'],verifiedConcept:true});await freezeBlock(b,c,800);const image=await cropCanvas(b,true),copy=canvas(600,400),cx=copy.getContext('2d');cx.drawImage(image,0,0);const src=g.getImageData(0,0,600,400).data,dst=cx.getImageData(0,0,600,400).data,plan=makePlans([b],selectedSettings());return{same:src.every((v,i)=>v===dst[i]),kind:b.kind,span:plan[0].items[0].columnSpan}});
  assert(result.same);assert.equal(result.kind,'apply');assert.equal(result.span,1);
 });
 await t.test('cropping retains faint box edges and excludes the outer yellow chapter tab',async()=>{
  const result=await page.evaluate(async()=>{const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);g.fillStyle='#ce603b';g.font='900 32px sans-serif';g.fillText('0132',50,100);g.strokeStyle='#d6d6d6';g.lineWidth=1;g.strokeRect(50.5,200.5,650,300);g.fillStyle='#222';g.font='24px serif';g.fillText('A formula in a faint rectangle',70,250);g.fillStyle='#ffdc48';g.fillRect(800,40,32,650);const parts=await segment(c,'1');return parts.map(p=>({number:p.number,left:p.rect.x,right:p.rect.x+p.rect.w,bottom:p.rect.y+p.rect.h}))});
  assert.equal(result.length,1);assert.equal(result[0].number,'0132');assert(result[0].left<=50);assert(result[0].right>700&&result[0].right<790);assert(result[0].bottom>500);
 });
 await t.test('downloaded standalone package renders PDF masks and reads numbers with all network access disabled',async()=>{
  const context=await browser.newContext({offline:true}),offline=await context.newPage();
  try{await offline.setContent(html.toString());await offline.waitForFunction(()=>!state.busy&&state.plans?.length);const result=await offline.evaluate(async(data)=>{const source=await PDFSource.open(bytes64(data)),image=await source.render(0),headers=await source.numberHeaders(0),c=canvas(150,60),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,150,60);g.fillStyle='#35772c';g.font='900 36px sans-serif';g.fillText('0078',5,45);const words=await recognizeNumberTiles([{image:c}]);const out={pdfWidth:image.width,headers:headers.map(h=>h.number),ocr:words.map(w=>w.text)};releaseCanvas(image);releaseCanvas(c);await source.destroy();return out},vectorFixture().toString('base64'));assert(result.pdfWidth>2400);assert.deepEqual(result.headers,['0078','0079']);assert(result.ocr.includes('0078'))}finally{await context.close();await page.bringToFront()}
 });
 await t.test('long problems span two rows without overflow or introducing a third row',async()=>{
  const result=await page.evaluate(async()=>{const blocks=Array.from({length:7},(_,i)=>({width:800,height:i===2?2200:240,referenceWidth:800,kind:'apply'}));const plans=makePlans(blocks,selectedSettings());return{tall:plans.flatMap(p=>p.items).find(x=>x.b.height===2200).span,all:plans.every(p=>p.items.length<=4&&p.items.every(x=>x.y+x.height<=PAPER.bottom+.01&&x.imageHeight+34<x.height))}});
  assert.equal(result.tall,2);assert(result.all);
  const layouts=await page.evaluate(()=>[0,1,2].map(index=>{const blocks=Array.from({length:3},(_,i)=>({width:800,height:i===index?1800:300,referenceWidth:800,kind:'apply'}));return makePlans(blocks,selectedSettings()).map(p=>({count:p.items.length,spans:p.items.map(x=>x.span),used:p.used}))}));
  for(const pages of layouts){assert.equal(pages.length,1);assert.equal(pages[0].count,3);assert.deepEqual([...pages[0].spans].sort(),[1,1,2]);assert(pages[0].used.every(Boolean))}
  const rendered=await page.evaluate(async()=>{
   const blocks=[];
   for(let i=0;i<3;i++){
    const c=canvas(800,i===0?1800:300),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.fillStyle='#222';g.font='28px serif';g.fillText(`Question ${i+1}`,20,40);
    for(let y=100;y<c.height-40;y+=120)g.fillText('f(x) = (x + 3) / (x - 1). Find the limit.',20,y);
    const b=newBlock({kind:i===0?'rep':'apply',group:1,label:String(i+1)});await freezeBlock(b,c,800);releaseCanvas(c);blocks.push(b);
   }
   const plans=makePlans(blocks,selectedSettings()),preview=await drawPage(plans[0],1.25),png=preview.toDataURL('image/png').split(',')[1];releaseCanvas(preview);
   const pdf=(await blobDataURL(new Blob([await pdfBytes(plans)],{type:'application/pdf'}))).split(',')[1];return{png,pdf,count:plans.length};
  });
  assert.equal(rendered.count,1);await mkdir(path.join(__dirname,'..','test-results'),{recursive:true});
  await writeFile(path.join(__dirname,'..','test-results','three-problems.png'),Buffer.from(rendered.png,'base64'));
  await writeFile(path.join(__dirname,'..','test-results','three-problems.pdf'),Buffer.from(rendered.pdf,'base64'));
 });
 await t.test('original gray boxes, graph strokes and colours are preserved without background erasure',async()=>{
  const result=await page.evaluate(async()=>{const c=canvas(500,350),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,500,350);g.fillStyle='#e1e1e1';g.fillRect(60,60,40,30);g.fillStyle='#888';g.fillRect(3,0,2,350);g.strokeStyle='#333';g.lineWidth=2;g.beginPath();g.moveTo(150,150);g.lineTo(450,150);g.moveTo(250,80);g.lineTo(250,280);g.stroke();g.fillStyle='#dc7522';g.fillRect(300,30,80,30);const clean=cleanCanvas(c),d=clean.getContext('2d');const pixel=(x,y)=>[...d.getImageData(x,y,1,1).data];return{noise:pixel(80,75),rule:pixel(3,180),axis:pixel(250,200),colour:pixel(320,40)}});
  assert.deepEqual(result.noise,[225,225,225,255]);assert.deepEqual(result.rule,[136,136,136,255]);assert(result.axis[0]<80);assert(result.colour[0]>result.colour[2]*2);
 });
 const pdf=await fixturePDF(page);
 await page.locator('#fileInput').setInputFiles({name:'21-scanned-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf,'base64')});await page.waitForFunction(()=>!state.busy&&state.pdf?.pages.length===21);
 await page.locator('#rangeInput').fill('1-21');await page.locator('#analyzeBtn').click();await page.waitForFunction(()=>!state.busy&&state.blocks.length===84,null,{timeout:180000});
 await t.test('all 21 pages were analyzed, source cache is bounded, short problems retain the same scale',async()=>{
  const result=await page.evaluate(()=>({pages:[...new Set(state.blocks.map(b=>b.page))],cache:state.cache.size,plans:state.plans.length,valid:state.plans.every(p=>p.items.length===4&&p.items.every(x=>x.span===1)),first:state.plans[0].items.map(x=>({w:x.b.width,scale:x.scale,ref:x.b.referenceWidth})),assets:state.blocks.every(b=>b.asset instanceof Blob)}));
  assert.equal(result.pages.length,21);assert.equal(result.plans,21);assert.equal(result.cache,2);assert(result.valid);assert(result.assets);
  assert(Math.max(...result.first.map(x=>x.w))/Math.min(...result.first.map(x=>x.w))>1.5);
  assert(Math.max(...result.first.map(x=>x.scale))-Math.min(...result.first.map(x=>x.scale))<.001);
 });
 await mkdir(path.join(__dirname,'..','test-results'),{recursive:true});
 await page.screenshot({path:path.join(__dirname,'..','test-results','blue-worksheet.png'),fullPage:true});
 await t.test('300 DPI download contains 21 valid A4 pages and omits generated labels/name/date',async()=>{
  await page.evaluate(async()=>{window.printedTexts=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...rest){window.printedTexts.push(String(text));return original.call(this,text,...rest)}});
  const pending=page.waitForEvent('download',{timeout:180000});await page.locator('#pdfBtn').click();const download=await pending;await download.saveAs(path.join(__dirname,'..','test-results','21-pages.pdf'));await page.waitForFunction(()=>!state.busy);
  const texts=await page.evaluate(()=>window.printedTexts);assert(texts.some(x=>x.includes('대표문제')));assert(!texts.some(x=>/문제\s*후보|이름 _|날짜 _/.test(x)));
  const exported=await readFile(path.join(__dirname,'..','test-results','21-pages.pdf'));const raw=exported.toString('latin1');assert(raw.startsWith('%PDF-1.4'));assert.equal((raw.match(/\/Type \/Page\b/g)||[]).length,21);assert.equal((raw.match(/\/Width 2482 \/Height 3510/g)||[]).length,21);assert(raw.includes('/Count 21'));assert(raw.trimEnd().endsWith('%%EOF'));
  // Export temporarily suspends preview work. Zoom must still redraw afterwards.
  await page.locator('#stage').scrollIntoViewIfNeeded();await page.locator('#zoomInput').selectOption('200');await page.waitForFunction(()=>state.pages[0].dataset.scale==='2');assert.equal(await page.evaluate(()=>state.pages[0].width),1588);await page.locator('#zoomInput').selectOption('0');
 });
 await t.test('saved-project roundtrip preserves physical scale, and v1 projects remain readable',async()=>{
  const result=await page.evaluate(async()=>{const snapshot=await projectSnapshot(),refs=state.blocks.map(b=>b.referenceWidth);await openProject(new Blob([JSON.stringify(snapshot)]));const same=state.blocks.every((b,i)=>b.referenceWidth===refs[i]);const legacy={...snapshot,format:'folio-lesson-v1',settings:{...snapshot.settings,theme:'green'},blocks:snapshot.blocks.slice(0,4).map(({referenceWidth,...b})=>b)};await openProject(new Blob([JSON.stringify(legacy)]));return{same,count:state.blocks.length,theme:$('themeInput').value,ready:state.plans.length>0}});
  assert(result.same);assert.equal(result.count,4);assert.equal(result.theme,'navy');assert(result.ready);
  const heights=await page.evaluate(()=>state.blocks.map(b=>b.bodyHeight*PAPER.CW/b.referenceWidth));
  assert(Math.max(...heights)-Math.min(...heights)<.001,'legacy crops should share an inferred text size');
 });
 await t.test('manual crop can reload an evicted source page, and reset restores its image',async()=>{
  const result=await page.evaluate(async()=>{await analyze();const b=state.blocks[0];state.active=b.id;await renderSource(1);const original={...b.rect},w=b.width;state.crop={x:original.x+10,y:original.y,w:original.w-10,h:original.h};await applyCrop(false);const changed=b.width<w;await resetCrop();return{changed,restored:b.width===w,cache:state.cache.size}});
  assert(result.changed);assert(result.restored);assert(result.cache<=2);
 });
 await t.test('standalone popout carries the current project and starts without external dependencies',async()=>{
  const standalone=await page.evaluate(()=>standaloneHTML()),other=await browser.newPage();try{await other.setContent(standalone,{waitUntil:'load'});await other.waitForFunction(()=>!state.busy&&state.plans?.length);assert.equal(await other.evaluate(()=>state.blocks.length),84)}finally{await other.close()}
 });
 assert.deepEqual(errors,[]);
});
