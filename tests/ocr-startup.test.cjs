const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {existsSync}=require('node:fs');
const path=require('node:path');
const {createServer}=require('node:http');
const {chromium}=require('playwright');

// Some local-file/opaque-origin browsers cannot import a second blob URL in a
// worker. Model that restriction at the browser boundary, without replacing OCR.
async function restrictWorkerImports(page){
 await page.evaluate(()=>{
  const create=URL.createObjectURL.bind(URL),blobs=new Map(),NativeWorker=Worker;
  URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url};
  window.Worker=class extends NativeWorker{
   constructor(url,options){
    const blob=blobs.get(String(url));
    if(blob&&options?.type!=='module'){
     const guard=`self.importScripts=function(...urls){throw new DOMException("Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at '"+urls[0]+"' failed to load.",'NetworkError')};\n`;
     url=create(new Blob([guard,blob],{type:'text/javascript'}));
    }
    super(url,options);
   }
  };
 });
}
async function readNumbers(page){
 return page.evaluate(async()=>{
  const tiles=['0078','0079'].map((n,i)=>{const c=canvas(170,70),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,170,70);g.fillStyle=i?'#2b67b6':'#35772c';g.font='900 38px sans-serif';g.fillText(n,8,49);return{image:c}});
  try{return(await recognizeNumberTiles(tiles)).map(w=>w.text)}finally{for(const t of tiles)releaseCanvas(t.image)}
 });
}

test('OCR startup works without worker importScripts and recovers from initialization failure',{timeout:120000},async(t)=>{
 const html=await readFile(path.join(__dirname,'..','index.html'),'utf8');
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const executablePath=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});t.after(()=>browser.close());
 for(const mode of ['opaque-offline','http-subpath'])await t.test(mode,async()=>{
  const context=await browser.newContext({offline:mode==='opaque-offline'}),page=await context.newPage();
  try{
   if(mode==='opaque-offline')await page.setContent(html);else await page.goto(`http://127.0.0.1:${server.address().port}/tutoring_helper/`);
   await page.waitForFunction(()=>!state.busy&&state.plans?.length);await restrictWorkerImports(page);
   assert.deepEqual(await readNumbers(page),['0078','0079']);
   // Exercise the actual Analyze button, rather than just starting the worker.
   const png=await page.evaluate(()=>{const c=canvas(850,1200),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,850,1200);for(const [i,n]of ['0078','0079'].entries()){const y=80+i*550;g.fillStyle='#35772c';g.font='900 32px sans-serif';g.fillText(n,50,y+32);g.fillStyle='#111';g.font='22px serif';g.fillText('Find the limit of this function.',50,y+95)}return c.toDataURL('image/png').split(',')[1]});
   await page.locator('#fileInput').setInputFiles({name:'two-questions.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(()=>!state.busy&&state.images.length===1);await page.locator('#columnInput').selectOption('1');await page.locator('#analyzeBtn').click();await page.waitForFunction(()=>!state.busy);
   assert.deepEqual(await page.evaluate(()=>state.blocks.map(b=>b.number)),['0078','0079']);assert.equal(await page.locator('#status').evaluate(n=>n.classList.contains('error')),false);
  }finally{await context.close()}
 });
 await t.test('a failed initialization can be retried without reloading the app',async()=>{
  const page=await browser.newPage();try{
   await page.setContent(html);await page.waitForFunction(()=>!state.busy&&state.plans?.length);
   await page.evaluate(async()=>{const script=document.createElement('script');script.src=await vendorURL('ocrMain');document.head.append(script);await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject});const create=Tesseract.createWorker;let first=true;Tesseract.createWorker=(...args)=>{if(first){first=false;return Promise.reject(Error('simulated startup failure'))}return create(...args)}});
   const message=await page.evaluate(async()=>{try{await ocrEngine();return''}catch(e){return e.message}});assert.match(message,/simulated startup failure/);
   assert.deepEqual(await readNumbers(page),['0078','0079']);
  }finally{await page.close()}
 });
});
