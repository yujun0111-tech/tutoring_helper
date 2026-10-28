const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

test('paper cleanup removes pale scan specks while keeping math, figures and originals', {timeout:120000},async t=>{
 const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage();page.setDefaultTimeout(60000);
 await page.setContent(await readFile(path.join(__dirname,'..','index.html'),'utf8'));
 await page.waitForFunction(()=>!state.busy&&state.plans?.length);
 await t.test('detached background marks disappear without resampling or erasing pale mathematical strokes',async()=>{
  const r=await page.evaluate(()=>{
   const c=canvas(640,480),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
   g.fillStyle='#eee';g.fillRect(510,100,2,2);g.fillStyle='#e6e6e6';g.fillRect(520,115,3,3);
   g.fillStyle='#f3f3f3';g.font='18px serif';g.fillText('faint reverse-page text',380,430);
   g.fillStyle='#171717';g.fillRect(50,40,5,35);g.fillStyle='#d2d2d2';g.fillRect(55,40,1,35);g.fillStyle='#fafafa';g.fillRect(56,40,1,35);
   g.fillStyle='#eee';g.fillRect(100,80,14,1); // pale minus/fraction bar
   g.strokeStyle='#e6e6e6';g.lineWidth=1;g.strokeRect(30.5,130.5,320,100);
   for(let x=40;x<=280;x+=16){g.fillStyle='#e6e6e6';g.fillRect(x,300,4,1)}
   for(let y=300;y<=440;y+=16){g.fillStyle='#e6e6e6';g.fillRect(320,y,1,4)}
   g.fillStyle='#e1e1e1';g.fillRect(400,200,40,30); // meaningful gray shading
   g.fillStyle='#dd7624';g.fillRect(400,50,40,25);
   g.strokeStyle='#333';g.beginPath();g.moveTo(40,260);g.lineTo(280,260);g.stroke();
   const before=g.getImageData(0,0,c.width,c.height).data,clean=cleanCanvas(c),d=clean.getContext('2d').getImageData(0,0,c.width,c.height).data;
   const same=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)for(let z=0;z<4;z++)if(before[(yy*c.width+xx)*4+z]!==d[(yy*c.width+xx)*4+z])return false;return true};
   return{size:[clean.width,clean.height],specks:[[510,100],[520,115]].map(([x,y])=>d[(y*c.width+x)*4]),aa:same(50,40,7,35),bar:same(100,80,14,1),frame:same(30,130,322,102),horizontal:same(40,300,244,1),vertical:same(320,300,1,144),shading:same(400,200,40,30),colour:same(400,50,40,25),axis:same(40,259,241,3),ghostBefore:[...before].filter((v,i)=>i%4===0&&Math.floor(i/4/c.width)>=410&&v<255).length,ghostAfter:[...d].filter((v,i)=>i%4===0&&Math.floor(i/4/c.width)>=410&&v<255&&i/4%c.width>360).length};
  });
  assert.deepEqual(r.size,[640,480]);assert.deepEqual(r.specks,[255,255]);
  for(const key of ['aa','bar','frame','horizontal','vertical','shading','colour','axis'])assert(r[key],key+' must retain its pixels');
  assert(r.ghostBefore>0);assert(r.ghostAfter<r.ghostBefore*.3);
 });
 await t.test('coloured paper is preserved',async()=>{
  const same=await page.evaluate(()=>{const c=canvas(200,150),g=c.getContext('2d');g.fillStyle='#eee8dc';g.fillRect(0,0,200,150);g.fillStyle='#555';g.fillText('a coloured-paper figure',20,70);const d=g.getImageData(0,0,200,150).data,e=cleanCanvas(c).getContext('2d').getImageData(0,0,200,150).data;return d.every((v,i)=>v===e[i])});assert(same);
 });
 await t.test('cleanup applies to preview and exported PDF, the switch restores original pixels, and concept images stay intact',async()=>{
  const r=await page.evaluate(async()=>{
   const c=canvas(640,480),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,640,480);g.fillStyle='#eee';g.fillRect(300,200,6,6);g.fillStyle='#222';g.fillRect(50,40,5,35);
   const b=newBlock({kind:'apply',number:'0078',sourceNumbers:['0078'],selected:true});await freezeBlock(b,c,640);b.audited=true;const original=await blobDataURL(b.asset);
   const at=async im=>{const out=canvas(im.width,im.height);out.getContext('2d').drawImage(im,0,0);return [...out.getContext('2d').getImageData(301,201,1,1).data]};
   const raw=await at(await cropCanvas(b,false)),clean=await at(await cropCanvas(b,true));
   const plans=makePlans([b],selectedSettings()),rendered=await drawPage(plans[0],300/96),item=plans[0].items[0],factor=300/96;
   const x=Math.round(item.x*factor)+Math.floor(301*Math.round(item.width*factor)/b.width),y=Math.round((item.y+29)*factor)+Math.floor(201*Math.round(item.imageHeight*factor)/b.height);
   // PDF decoding below checks the same rendered question, independent of the crop cache.
   const sample=out=>{const sx=out.width/PAPER.W,sy=out.height/PAPER.H,x=Math.round(item.x*sx)+Math.round(302*item.scale*sx),y=Math.round((item.y+29)*sy)+Math.round(202*item.scale*sy);return [...out.getContext('2d').getImageData(x,y,1,1).data]};
   const source=await PDFSource.open(await pdfBytes(plans)),out=await source.render(0),pdfClean=sample(out);releaseCanvas(out);await source.destroy();
   const rawPlans=makePlans([b],{...selectedSettings(),clean:false}),rawSource=await PDFSource.open(await pdfBytes(rawPlans)),rawOut=await rawSource.render(0),pdfRaw=sample(rawOut);releaseCanvas(rawOut);await rawSource.destroy();
   const concept=newBlock({kind:'concept',verifiedConcept:true});await freezeBlock(concept,c,640);const untouched=await at(await cropCanvas(concept,true));
   state.blocks=[b];$('paperCleanupCheck').checked=false;const saved=await projectSnapshot();await openProject(new Blob([JSON.stringify(saved)]));const off=selectedSettings().clean;
   const restored=await at(await cropCanvas(state.blocks[0],selectedSettings().clean));delete saved.settings.paperCleanup;saved.settings.clean=false;await openProject(new Blob([JSON.stringify(saved)]));
   const result={raw,clean,untouched,restored,off,oldDefault: selectedSettings().clean,originalSame:original===await blobDataURL(b.asset),savedRaw:saved.blocks[0].image===original,pdfClean,pdfRaw,planClean:plans[0].settings.clean,previewPixel:[...rendered.getContext('2d').getImageData(x,y,1,1).data]};
   releaseCanvas(rendered);return result;
  });
  assert.deepEqual(r.raw,[238,238,238,255]);assert.deepEqual(r.clean,[255,255,255,255]);assert.deepEqual(r.untouched,r.raw);assert.deepEqual(r.restored,r.raw);
  assert.equal(r.off,false);assert(r.oldDefault);assert(r.originalSame);assert(r.savedRaw);assert(r.planClean);assert.deepEqual(r.previewPixel,[255,255,255,255]);assert.deepEqual(r.pdfClean,[255,255,255,255]);assert(r.pdfRaw[0]<245);
 });
});
