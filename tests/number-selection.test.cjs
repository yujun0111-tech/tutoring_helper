const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

test('number selection is usable before and after extraction and survives saving', {timeout:120000},async t=>{
 const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage();page.setDefaultTimeout(60000);await page.setContent(await fs.readFile(path.join(__dirname,'..','index.html'),'utf8'));await page.waitForFunction(()=>!state.busy&&state.plans?.length);
 await t.test('ranges, leading zeros, Korean suffixes and duplicates select exactly the requested questions',async()=>{
  const r=await page.evaluate(()=>{const blocks=[{kind:'concept',selected:true},...['0001','0018','0022','0023','0024','0025','0057','0078','0079'].map(number=>({kind:'apply',number,selected:true}))],intervals=parseQuestionNumbers('18번， 0022 ~ 25, 57 78–79, 22'),result=selectQuestionNumbers(blocks,intervals);return{result,numbers:blocks.filter(b=>b.kind!=='concept'&&b.selected).map(b=>b.number),concept:blocks[0].selected,huge:selectQuestionNumbers([{kind:'apply',number:'0001'}],parseQuestionNumbers('1-999999'))}});
  assert.deepEqual(r.numbers,['0018','0022','0023','0024','0025','0057','0078','0079']);assert.equal(r.result.count,8);assert.deepEqual(r.result.missing,[]);assert(r.concept);assert.deepEqual(r.huge.missing,[[2,999999]]);
  for(const text of ['1-0','0','12, abc','2--5','1.5','9999999'])await assert.rejects(page.evaluate(s=>parseQuestionNumbers(s),text));
 });
 await t.test('button and Enter apply the selection, hide unselected cards and report unavailable numbers',async()=>{
  await page.locator('#numberInput').fill('44, 45, 999');await page.locator('#selectNumbersBtn').click();
  const r=await page.evaluate(()=>({numbers:state.blocks.filter(b=>b.kind!=='concept'&&b.selected).map(b=>b.number),visible:document.querySelectorAll('#blockList .block-card').length,concepts:state.blocks.filter(b=>b.kind==='concept'&&b.selected).length}));
  assert.deepEqual(r.numbers,['0044','0045']);assert.equal(r.visible,2+r.concepts);assert(await page.locator('#selectedOnlyCheck').isChecked());assert.match(await page.locator('#numberSelectionStatus').textContent(),/999/);
  await page.locator('#selectedOnlyCheck').uncheck();assert.equal(await page.locator('#blockList .block-card').count(),6);
  await page.locator('#numberInput').fill('45');await page.locator('#numberInput').press('Enter');assert.deepEqual(await page.evaluate(()=>state.blocks.filter(b=>b.kind!=='concept'&&b.selected).map(b=>b.number)),['0045']);
  await page.locator('#numberInput').fill('4-2');await page.locator('#selectNumbersBtn').click();assert.deepEqual(await page.evaluate(()=>state.blocks.filter(b=>b.kind!=='concept'&&b.selected).map(b=>b.number)),['0045']);
 });
 await t.test('saved settings preserve selection/filter/profile while old projects default to automatic profile',async()=>{
  await page.locator('#numberInput').fill('45');await page.locator('#bookInput').selectOption('rpm');
  const r=await page.evaluate(async()=>{const saved=await projectSnapshot();$('numberInput').value='';$('selectedOnlyCheck').checked=false;$('bookInput').value='auto';await openProject(new Blob([JSON.stringify(saved)]));const after=selectedSettings();delete saved.settings.numbers;delete saved.settings.selectedOnly;delete saved.settings.book;await openProject(new Blob([JSON.stringify(saved)]));return{after,legacy:selectedSettings()}});
  assert.equal(r.after.numbers,'45');assert.equal(r.after.selectedOnly,true);assert.equal(r.after.book,'rpm');assert.equal(r.legacy.numbers,'');assert.equal(r.legacy.selectedOnly,false);assert.equal(r.legacy.book,'auto');
 });
 await t.test('a shared stem is composed without including sibling questions, at the original pixel scale',async()=>{
  const r=await page.evaluate(async()=>{const c=canvas(800,600),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,800,600);g.fillStyle='#222';g.fillRect(40,40,450,40);g.fillStyle='#008080';g.fillRect(40,300,140,40);g.fillStyle='#e00000';g.fillRect(40,180,100,40);const b=newBlock({book:'rpm',number:'0003',sourceNumbers:['0003'],rect:{x:30,y:290,w:500,h:70},sharedRect:{x:30,y:30,w:500,h:70}});await freezeBlock(b,c,700);const im=await cropCanvas(b,false),out=canvas(im.width,im.height),cx=out.getContext('2d');cx.drawImage(im,0,0);const d=cx.getImageData(0,0,out.width,out.height).data;let red=0,stem=0,own=0;for(let k=0;k<d.length;k+=4){red+=d[k]>200&&d[k+1]<40;stem+=d[k]===34&&d[k+1]===34;own+=d[k]===0&&d[k+1]===128}return{size:[out.width,out.height],red,stem,own,reference:b.referenceWidth}});
  assert.deepEqual(r.size,[500,144]);assert.equal(r.red,0);assert.equal(r.stem,450*40);assert.equal(r.own,140*40);assert.equal(r.reference,700);
 });
});
