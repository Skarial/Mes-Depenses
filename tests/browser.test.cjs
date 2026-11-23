// Browser verification uses disposable local profiles and synthetic data only.
// Playwright is a development-only test tool; the application has no runtime dependency.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const B=require('../budget.js');
const app=path.resolve(__dirname,'..');
const launchOptions={headless:process.env.HEADED!=='1'};
const legacy={version:1,categories:['Bouffe','Factures','Autres'],expenses:[
  {id:'old1',date:'2026-10-24',cents:1000,category:'Bouffe',description:'Achat historique 1',created:1},
  {id:'old2',date:'2026-10-25',cents:2000,category:'Factures',description:'Achat historique 2',created:2},
  {id:'old3',date:'2026-11-01',cents:3000,category:'Bouffe',description:'Achat historique 3',created:3}
]};
let browser,server,url,upgrade=false;
before(async()=>{
  server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const old=pathname.startsWith('/upgrade/')&&!upgrade;const root=old?process.env.BASELINE_DIR:app;if(!root){res.writeHead(404).end();return}let file=pathname.replace(/^\/upgrade\//,'/').slice(1)||'index.html';if(!['index.html','budget.js','sw.js','manifest.webmanifest','icon.svg'].includes(file)){res.writeHead(404).end();return}const bytes=await fs.readFile(path.join(root,file));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'application/json','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch(launchOptions);
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function open(seed=legacy,route='/',options={}){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Paris',...options}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
  await page.clock.install({time:new Date('2026-11-20T12:00:00Z')});
  if(seed!==null)await context.addInitScript(({seed,key})=>{if(!localStorage.getItem('fixture-seeded')){localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem('fixture-seeded','yes')}},{seed,key:B.KEYS.legacy});
  await page.goto(process.env.FILE_MODE?require('node:url').pathToFileURL(path.join(app,'index.html')).href:url+route);await page.waitForSelector('#total');
  return {context,page,errors};
}
async function navigate(page,section){await page.locator('.app-nav').getByRole('button',{name:section,exact:true}).click();}
async function salary(page,date='2026-10-25',net='2198,75'){await navigate(page,'Budget');await page.locator('#receiveSalary').click();await page.locator('#salaryDate').fill(date);await page.locator('#salaryNet').fill(net);await page.locator('#confirmSalary').click();}
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),B.KEYS.current)}
async function download(page,selector){await navigate(page,'Réglages');const wait=page.waitForEvent('download');await page.locator(selector).click();const result=await wait;return JSON.parse(await fs.readFile(await result.path(),'utf8'));}
async function importJson(page,obj){await navigate(page,'Réglages');await page.locator('#file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(obj))});await page.waitForFunction(()=>document.getElementById('file').files.length===0);}
async function controlled(page){await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))});}

test('UI : migration, montant réel obligatoire, vue mensuelle, rapport et export',async()=>{
  const {context,page,errors}=await open();try{
    assert.equal(await page.locator('#total').textContent(),'30,00 €');
    assert.equal(await page.locator('#ledgerBalance').textContent(),'Indéterminé');
    assert.equal(await page.locator('#ledgerPeriodSlot').isVisible(),false);
    assert.equal(await page.locator('#entries .ledger-day time').getAttribute('datetime'),'2026-11-01');
    await page.setViewportSize({width:320,height:740});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.setViewportSize({width:390,height:844});
    await navigate(page,'Budget');await page.locator('#receiveSalary').click();assert.equal(await page.locator('#salaryDate').inputValue(),'2026-11-20');assert.equal(await page.locator('#salaryNet').inputValue(),'');
    await page.locator('#confirmSalary').click();assert.equal(await page.locator('#salaryDialog').isVisible(),true);
    await page.locator('#salaryDate').fill('2026-10-25');await page.locator('#salaryNet').fill('2198,75');await page.locator('#confirmSalary').click();
    assert.equal(await page.locator('#salaryDialog').isVisible(),false);assert.equal(await page.locator('#periodMode').inputValue(),'cycle');
    const data=await saved(page);assert.deepEqual(data.expenses,legacy.expenses);assert.equal(data.paydays[0].netCents,219875);assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),B.KEYS.legacy),legacy);
    await navigate(page,'Analyses');await page.locator('#analyzeCurrent').click();await page.locator('#analyzeMonth').click();const report=await page.locator('#analysisText').inputValue();assert.match(report,/2026-10-25 \|/);assert.match(report,/2026-11-01 \|/);assert.match(report,/2.198,75/);assert.match(report,/Complétude/);await page.locator('#closeMonthDialog').click();
    const exported=await download(page,'#export');assert.deepEqual(exported.expenses,legacy.expenses);assert.equal(exported.version,2);
    await navigate(page,'Dépenses');await page.locator('#ledgerFilter').click();await page.locator('#periodMode').selectOption('month');assert.equal(await page.locator('#total').textContent(),'30,00 €');await page.locator('#prev').click();assert.equal(await page.locator('#total').textContent(),'30,00 €');
    await page.locator('#periodMode').selectOption('cycle');
    const confirmed=await saved(page);
    const remaining=B.budget(confirmed,B.cycles(confirmed)[0],'2026-11-20').remainingCents;
    assert.equal(await page.locator('#ledgerBalance').textContent(),new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(remaining/100));
    assert.match(await page.locator('#ledgerCycle').textContent(),/fin prévue/);
    assert.deepEqual(await page.locator('#entries .ledger-day time').evaluateAll(days=>days.map(day=>day.dateTime)),['2026-11-01','2026-10-25']);
    await page.locator('#ledgerFilter').click();
    if(process.env.SCREENSHOT_DIR){await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'cycle-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'cycle-desktop.png'),fullPage:true});}
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : doublon rejeté, correction et annulation sans perte',async()=>{
  const {context,page,errors}=await open();try{await salary(page);await salary(page);assert.equal(await page.locator('#salaryError').isVisible(),true);assert.match(await page.locator('#salaryError').innerText(),/déjà/);await page.locator('#closeSalary').click();
    await salary(page,'2026-11-20','2250');assert.equal((await saved(page)).paydays.length,2);
    await page.getByText('Paies enregistrées et corrections',{exact:true}).click();await page.getByRole('button',{name:'Corriger la paie du 2026-10-25',exact:true}).click();await page.locator('#salaryDate').fill('2026-10-24');await page.locator('#salaryNet').fill('2201,01');await page.locator('#confirmSalary').click();
    assert.equal((await saved(page)).paydays[0].date,'2026-10-24');assert.equal((await saved(page)).paydays[0].netCents,220101);
    await page.getByRole('button',{name:'Annuler la paie du 2026-11-20',exact:true}).click();assert.equal((await saved(page)).paydays.length,1);assert.deepEqual((await saved(page)).expenses,legacy.expenses);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : dépenses et catégories existantes, édition et suppression',async()=>{
  const {context,page,errors}=await open();try{await page.locator('#ledgerCategories > summary').click();await page.getByRole('button',{name:'Ajouter une dépense dans Bouffe',exact:true}).click();await page.locator('#amount').fill('0,10');await page.locator('#date').fill('2026-11-20');await page.locator('#submit').click();assert.equal((await saved(page)).expenses.at(-1).cents,10);
    await page.locator('#historyToggle').click();assert.equal(await page.locator('#entries').isVisible(),false);await page.locator('#historyToggle').click();await page.locator('#entries .edit').first().click();await page.locator('#amount').fill('0,20');await page.locator('#expenseKind').selectOption('bitcoin');await page.locator('#submit').click();assert.equal((await saved(page)).expenses.at(-1).kind,'bitcoin');
    await page.locator('#entries .edit').first().click();await page.locator('#delete').click();assert.deepEqual((await saved(page)).expenses,legacy.expenses);
    await navigate(page,'Réglages');await page.locator('#manage').click();await page.locator('#newCat').fill('Santé');await page.locator('#addCat').click();await page.getByLabel('Renommer Santé',{exact:true}).fill('Soins');await page.getByLabel('Renommer Santé',{exact:true}).press('Tab');assert.ok((await saved(page)).categories.includes('Soins'));await page.getByRole('button',{name:'Supprimer Factures',exact:true}).click();const result=await saved(page);assert.equal(result.expenses.length,3);assert.equal(result.expenses.find(e=>e.id==='old2').category,'Autres');assert.equal(result.expenses.find(e=>e.id==='old2').cents,2000);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : sauvegardes v1/v2, JSON invalide refusé et restauration',async()=>{
  const {context,page,errors}=await open();try{await salary(page);const exported=await download(page,'#export');await importJson(page,legacy);assert.equal((await saved(page)).paydays.length,0);assert.deepEqual((await saved(page)).expenses,legacy.expenses);await importJson(page,exported);assert.equal((await saved(page)).paydays.length,1);const before=await saved(page);await importJson(page,{...legacy,expenses:[...legacy.expenses,{...legacy.expenses[0]}]});assert.deepEqual(await saved(page),before);assert.match(await page.locator('#toast').innerText(),/Import impossible/);await importJson(page,{...exported,version:99});assert.deepEqual(await saved(page),before);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : quota dépassé, aucun faux succès ni dépense perdue',async()=>{
  const {context,page,errors}=await open();try{await salary(page);const before=await saved(page);await page.evaluate(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Quota exceeded','QuotaExceededError');return set.call(this,k,v)}},B.KEYS.current);await navigate(page,'Dépenses');await page.locator('#addExpense').click();await page.locator('#ledgerCategory').selectOption('Bouffe');await page.locator('#amount').fill('5');await page.locator('#submit').click();assert.match(await page.locator('#toast').innerText(),/Enregistrement impossible/);assert.deepEqual(await saved(page),before);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : données corrompues préservées et import de récupération',async()=>{
  const {context,page,errors}=await open();try{await salary(page);const good=await saved(page);await page.evaluate(({current,backup,good})=>{localStorage.setItem(backup,JSON.stringify(good));localStorage.setItem(current,'{cassé')},{current:B.KEYS.current,backup:B.KEYS.backup,good});await page.reload();assert.equal(await page.locator('#storageNotice').isVisible(),true);assert.equal(await page.locator('#receiveSalary').isDisabled(),true);assert.equal(await page.evaluate(key=>localStorage.getItem(key),B.KEYS.current),'{cassé');await importJson(page,good);assert.equal(await page.locator('#storageNotice').isVisible(),false);assert.deepEqual((await saved(page)).expenses,legacy.expenses);assert.equal(await page.evaluate(key=>localStorage.getItem(key),B.KEYS.damaged),'{cassé');assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : budget affiché, réserves sans double comptage et salaire réel',async()=>{
  const {context,page,errors}=await open(null);try{
    await navigate(page,'Budget');await page.getByText('Prévisions budgétaires',{exact:true}).click();await page.locator('#dcaWeekday').selectOption('1');await page.getByRole('button',{name:'Enregistrer les prévisions',exact:true}).click();
    await salary(page,'2026-02-02','2200');await salary(page,'2026-03-02','2200');await page.locator('#prev').click();
    assert.equal(await page.locator('#budgetContent .budget-value').innerText(),'860,00 €');
    const add=async(amount,kind)=>{await navigate(page,'Dépenses');await page.locator('#addExpense').click();await page.locator('#ledgerCategory').selectOption('Bouffe');await page.locator('#amount').fill(amount);await page.locator('#date').fill('2026-02-03');await page.locator('#expenseKind').selectOption(kind);await page.locator('#submit').click();await navigate(page,'Budget');};
    await add('100','variable');assert.equal(await page.locator('#budgetContent .budget-value').innerText(),'760,00 €');
    await add('1100','fixed');await add('40','bitcoin');await add('200','savings');assert.equal(await page.locator('#budgetContent .budget-value').innerText(),'760,00 €');
    await add('20','fixed');assert.equal(await page.locator('#budgetContent .budget-value').innerText(),'740,00 €');
    await page.getByText('Paies enregistrées et corrections',{exact:true}).click();await page.getByRole('button',{name:'Corriger la paie du 2026-02-02',exact:true}).click();await page.locator('#salaryNet').fill('2250,01');await page.locator('#confirmSalary').click();
    assert.equal(await page.locator('#budgetContent .budget-value').innerText(),'790,01 €');assert.equal((await saved(page)).expenses.length,5);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : hors ligne, redémarrage, paie, dépense, rapport, export et import',{skip:!!process.env.FILE_MODE,timeout:90000},async()=>{
  // A dedicated persistent profile allows a genuine Chromium shutdown/restart.
  // Never use the user's normal Chrome/Edge profile. Do not reseed after reopening.
  const profile=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'mes-depenses-validation-'));
  let context,page;const errors=[];
  const start=async(offline)=>{context=await chromium.launchPersistentContext(profile,{...launchOptions,viewport:{width:390,height:844},timezoneId:'Europe/Paris'});await context.setOffline(offline);page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());await page.clock.install({time:new Date('2026-11-20T12:00:00Z')});};
  try{
    await start(false);await context.addInitScript(({seed,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed))},{seed:legacy,key:B.KEYS.legacy});await page.goto(url+'/');await controlled(page);await salary(page);const beforeClose=await saved(page);
    await context.close();context=null;
    await start(true);await page.goto(url+'/');await navigate(page,'Budget');await page.waitForSelector('#receiveSalary');assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));assert.deepEqual(await saved(page),beforeClose);
    await salary(page,'2026-11-20','2250');await navigate(page,'Dépenses');await page.locator('#addExpense').click();await page.locator('#ledgerCategory').selectOption('Bouffe');await page.locator('#amount').fill('12,34');await page.locator('#submit').click();await page.reload();assert.equal((await saved(page)).expenses.length,4);await page.locator('#ledgerFilter').click();await page.locator('#periodMode').selectOption('cycle');await navigate(page,'Analyses');await page.locator('#analyzeCurrent').click();await page.locator('#analyzeMonth').click();assert.match(await page.locator('#analysisText').inputValue(),/12,34/);await page.locator('#closeMonthDialog').click();const exported=await download(page,'#export');await importJson(page,exported);assert.deepEqual((await saved(page)).expenses,exported.expenses);assert.deepEqual(errors,[]);
  }finally{await context?.close();console.log('Profil synthétique de validation conservé : '+profile)}
});
test('UI : mise à jour v27 vers v29 puis réouverture hors ligne',{skip:!process.env.BASELINE_DIR||!!process.env.FILE_MODE,timeout:30000},async()=>{
  upgrade=false;
  const {context,page,errors}=await open(legacy,'/upgrade/');
  try{
    await controlled(page);
    assert.equal(await page.evaluate(()=>caches.has('mes-depenses-v27')),true);
    await salary(page);
    const beforeUpdate=await saved(page);
    upgrade=true;
    await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      const updating=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      await registration.update();
      await updating;
    });
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.locator('#addExpense').isVisible(),true);
    assert.equal(await page.locator('#portfolioView .wealth-summary').count(),1);
    assert.equal(await page.evaluate(()=>caches.has('mes-depenses-v29')),true);
    assert.equal(await page.evaluate(()=>caches.has('mes-depenses-v27')),false);
    assert.deepEqual(await saved(page),beforeUpdate);
    assert.deepEqual(errors,[]);
  }finally{await context.close();upgrade=true}
});
