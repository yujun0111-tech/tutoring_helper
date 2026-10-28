const {test}=require('node:test');const assert=require('node:assert/strict');const {readFile}=require('node:fs/promises');const {existsSync}=require('node:fs');const path=require('node:path');const {chromium}=require('playwright');

test('concept regions contain their tips, examples, highlights and diagrams',{timeout:120000},async(t)=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage();await page.setContent(await readFile(path.join(__dirname,'..','index.html'),'utf8'));await page.waitForFunction(()=>!state.busy&&state.plans?.length);
 await page.evaluate(()=>{window.conceptFixture=(readable=false)=>{
  const c=canvas(850,1400),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1400);
  const text=(s,y)=>{g.fillStyle='#151515';g.font='22px serif';g.fillText(s,80,y)};
  const heading=(y,code)=>{g.strokeStyle='#aaa';g.lineWidth=1;g.strokeRect(70,y,550,28);g.fillStyle='#e47b27';g.fillRect(70,y,52,28);if(code){g.fillStyle='#fff';g.font='bold 17px sans-serif';g.fillText(code,72,y+21)}g.fillStyle='#151515';g.font='22px serif';g.fillText('A complete concept heading',140,y+23)};
  heading(80,readable?'01-1':'');g.fillStyle='#d2e65b';g.fillRect(80,145,340,24);text('Highlighted definition stays in the concept.',165);
  g.strokeStyle='#3157b6';g.strokeRect(80,230,22,13);g.fillStyle='#3157b6';g.font='11px sans-serif';g.fillText('tip',81,241);text('The tip is part of this same explanation.',275);
  g.strokeStyle='#378e64';g.strokeRect(80,325,22,13);g.fillStyle='#378e64';g.fillText('ex',81,336);text('An inline worked example.',375);
  g.fillStyle='#d24732';g.font='18px sans-serif';g.fillText('01-7',100,405);
  g.strokeStyle='#333';g.lineWidth=2;g.beginPath();g.moveTo(125,450);g.lineTo(125,550);g.moveTo(90,525);g.lineTo(510,525);g.stroke();text('The final line must remain visible.',575);
  heading(660,'01-2');text('Another definition.',740);g.strokeStyle='#3157b6';g.strokeRect(80,790,22,13);text('Another tip belongs to the second concept.',835);text('The final condition.',915);
  g.fillStyle='#35772c';g.font='900 32px sans-serif';g.fillText('0078',75,1110);text('A real separately numbered question.',1170);
  return c;
 }});
 await t.test('unreadable concept code plus a real title rule still retains the whole section',async()=>{
  const result=await page.evaluate(async()=>{const c=conceptFixture(),parts=await segment(c,'auto');const out=parts.map(a=>({kind:a.kind,verified:a.verifiedConcept,number:a.number,top:a.rect.y,bottom:a.rect.y+a.rect.h,right:a.rect.x+a.rect.w}));releaseCanvas(c);return out});
  assert.equal(result.length,3);assert.deepEqual(result.map(x=>x.kind),['concept','concept','apply']);assert(result[0].verified&&result[1].verified);assert(result[0].top<=80);assert(result[0].bottom>575&&result[0].bottom<650);assert(result[1].bottom>915&&result[1].bottom<1080);assert.equal(result[2].number,'0078');
 });
 await t.test('an orange difficulty marker and a separate column rule cannot become a concept title',async()=>{
  const parts=await page.evaluate(async()=>{const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);g.strokeStyle='#999';g.lineWidth=1;g.strokeRect(420,590,345,28);g.fillStyle='#e57d29';g.fillRect(115,596,26,14);g.fillStyle='#fff';g.font='11px sans-serif';g.fillText('H',121,607);for(const [x,y,n]of [[50,80,'0044'],[50,600,'0045'],[425,80,'0060'],[425,600,'0061']]){g.fillStyle='#35772c';g.font='900 32px sans-serif';g.fillText(n,x,y+32);g.fillStyle='#111';g.font='22px serif';g.fillText('A real separate question.',x,y+95)}const parts=await segment(c,'auto');releaseCanvas(c);return parts.map(a=>({number:a.number,kind:a.kind,width:a.rect.w}))});
  assert.deepEqual(parts.map(a=>a.number),['0044','0045','0060','0061']);assert(parts.every(a=>a.kind!=='concept'&&a.width<425));
 });
 await t.test('each complete concept fits the page without clipping or generating a solution label',async()=>{
  const result=await page.evaluate(async()=>{const c=conceptFixture(),parts=await segment(c,'auto'),blocks=[];for(const a of parts){const b=newBlock({...a,sourceNumbers:a.number?[a.number]:[]});await freezeBlock(b,c,a.referenceWidth);b.audited=true;blocks.push(b)}const plans=makePlans(blocks,selectedSettings());const valid=plans.every(p=>p.items.every(i=>i.y+i.height<=PAPER.bottom+.01&&i.imageHeight+34<=i.height));const first=plans.flatMap(p=>p.items).find(i=>i.b.kind==='concept');releaseCanvas(c);return{valid,concepts:blocks.filter(b=>b.kind==='concept').length,span:first.columnSpan,tall:first.span}});
  assert(result.valid);assert.equal(result.concepts,2);assert.equal(result.span,2);assert.equal(result.tall,2);
 });
 await t.test('an older complete concept image is not split at its TIP and example markers on import',async()=>{
  const result=await page.evaluate(async()=>{const c=conceptFixture(true),crop=canvas(620,560);crop.getContext('2d').drawImage(c,50,60,620,560,0,0,620,560);const project={format:'folio-lesson-v2',settings:selectedSettings(),blocks:[{kind:'concept',selected:true,referenceWidth:620,image:crop.toDataURL('image/png')}]};releaseCanvas(c);releaseCanvas(crop);await openProject(new Blob([JSON.stringify(project)]));return{count:state.blocks.length,kinds:state.blocks.map(b=>b.kind),verified:state.blocks.every(b=>b.verifiedConcept)}});
  assert.equal(result.count,1);assert.deepEqual(result.kinds,['concept']);assert(result.verified);
 });
});
