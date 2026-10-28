const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {chromium}=require('playwright');
const projectFile=process.env.BACKGROUND_PROJECT;

test('actual book questions: scan background cleanup preserves foreground and source assets', {skip:!projectFile,timeout:180000},async t=>{
 const html=await fs.readFile(path.join(__dirname,'..','index.html'),'utf8'),project=JSON.parse(await fs.readFile(projectFile,'utf8'));
 const out=path.join(__dirname,'..','test-results','background-integration');await fs.mkdir(out,{recursive:true});
 const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage();page.setDefaultTimeout(120000);await page.setContent(html);await page.waitForFunction(()=>!state.busy&&state.plans?.length);
 const records=[];
 for(const a of project.blocks){
  const r=await page.evaluate(async a=>{
   const blob=new Blob([bytes64(a.image.split(',')[1])],{type:'image/png'}),im=await imageFromBlob(blob),raw=canvas(im.width,im.height),g=raw.getContext('2d');g.drawImage(im,0,0);im.close?.();
   const before=g.getImageData(0,0,raw.width,raw.height).data,clean=cleanCanvas(raw),after=clean.getContext('2d').getImageData(0,0,raw.width,raw.height).data;
   let changed=0,ink=0,inkChanged=0,colours=0,colourChanged=0;
   for(let k=0;k<before.length;k+=4){const diff=before[k]!==after[k]||before[k+1]!==after[k+1]||before[k+2]!==after[k+2],lo=Math.min(before[k],before[k+1],before[k+2]),hi=Math.max(before[k],before[k+1],before[k+2]);changed+=diff;if(lo<185){ink++;inkChanged+=diff}if(hi-lo>=35){colours++;colourChanged+=diff}}
   const proofs=['0044','0057','0068','0114','0131'].includes(a.number),png=proofs?clean.toDataURL('image/png').split(',')[1]:null,original=proofs?raw.toDataURL('image/png').split(',')[1]:null;
   const result={number:a.number,width:clean.width,height:clean.height,sizeSame:clean.width===raw.width&&clean.height===raw.height,changed,ink,inkChanged,colours,colourChanged,png,original};releaseCanvas(raw);releaseCanvas(clean);return result;
  },a);
  assert(r.sizeSame);assert(r.ink>0);assert.equal(r.inkChanged,0,`question ${r.number}: ink changed`);assert.equal(r.colourChanged,0,`question ${r.number}: colour changed`);
  if(r.png){assert(r.changed>100,`question ${r.number}: background marks were not cleaned`);for(const [key,label] of [['png','clean'],['original','raw']])await fs.writeFile(path.join(out,`${r.number}-${label}.png`),Buffer.from(r[key],'base64'))}
  delete r.png;delete r.original;records.push(r);
 }
 await page.evaluate(async project=>openProject(new Blob([JSON.stringify(project)])),project);assert.equal(await page.locator('#paperCleanupCheck').isChecked(),true);
 const geometry=await page.evaluate(()=>state.plans.map(p=>p.items.map(i=>({number:i.b.number,column:i.slot>>1,span:i.span}))));
 for(const items of geometry){assert(items.length<=4);for(const c of [0,1])assert(items.filter(i=>i.column===c).length<=2)}
 const data=await page.evaluate(async()=>({pdf:await blobDataURL(new Blob([await pdfBytes(state.plans)],{type:'application/pdf'})),project:await projectSnapshot()}));
 assert.deepEqual(data.project.blocks.map(a=>a.image),project.blocks.map(a=>a.image),'saved raw source images changed');
 await fs.writeFile(path.join(out,'clean-book-sample.pdf'),Buffer.from(data.pdf.split(',')[1],'base64'));
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({appHash:crypto.createHash('sha256').update(html).digest('hex'),sampleHash:crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex'),questions:records.length,changedPixels:records.reduce((n,r)=>n+r.changed,0),inkChanged:0,colourChanged:0,geometry,records},null,2));
});
