// Browser verification uses disposable local profiles and synthetic data only.
// Playwright is a development-only test tool; the application has no runtime dependency.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const B=require('../budget.js');
const app=path.resolve(__dirname,'..');
const launchOptions={headless:process.env.HEADED!=='1',args:['--no-proxy-server']};
const legacy={version:1,categories:['Bouffe','Factures','Autres'],expenses:[
  {id:'old1',date:'2026-10-24',cents:1000,category:'Bouffe',description:'Achat historique 1',created:1},
  {id:'old2',date:'2026-10-25',cents:2000,category:'Factures',description:'Achat historique 2',created:2},
  {id:'old3',date:'2026-11-01',cents:3000,category:'Bouffe',description:'Achat historique 3',created:3}
]};
const v2={
  ...legacy,
  version:2,
  settings:{...B.DEFAULTS,incomeCents:224900},
  paydays:[{id:'historical',date:'2026-10-25',netCents:216743,created:4,plan:{...B.DEFAULTS,incomeCents:220123}}],
  portfolio:{checking:50000,savings:200000,balance1:12000000,balance2:1000000},
  goals:{works:{target:2000000,reserved:20000,monthly:20000}}
};
let browser,server,url,upgrade=false;
before(async()=>{
  server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const old=pathname.startsWith('/upgrade/')&&!upgrade;const root=old?process.env.BASELINE_DIR:app;if(!root){res.writeHead(404).end();return}let file=pathname.replace(/^\/upgrade\//,'/').slice(1)||'index.html';if(!['index.html','budget.js','sw.js','manifest.webmanifest','icon.svg','icon-48.png','apple-touch-icon.png','icon-192.png','icon-512.png','icon-maskable-512.png'].includes(file)){res.writeHead(404).end();return}const bytes=await fs.readFile(path.join(root,file));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'application/json','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch(launchOptions);
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});});
async function open(seed=legacy,route='/',options={}){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Paris',...options}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
  await page.clock.install({time:new Date('2026-11-20T12:00:00Z')});
  if(seed!==null)await context.addInitScript(({seed,key})=>{if(!localStorage.getItem('fixture-seeded')){localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem('fixture-seeded','yes')}},{seed,key:B.KEYS.legacy});
  await page.goto(process.env.FILE_MODE?require('node:url').pathToFileURL(path.join(app,'index.html')).href:url+route);await page.waitForSelector('#total');
  return {context,page,errors};
}
async function navigate(page,section){await page.locator('.app-nav').getByRole('button',{name:section,exact:true}).click();}
async function salary(page,date='2026-10-25'){await navigate(page,'Budget');await page.locator('#receiveSalary').click();await page.locator('#salaryDate').fill(date);await page.locator('#confirmSalary').click();}
async function saved(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),B.KEYS.current)}
async function download(page,selector){await navigate(page,'Réglages');const wait=page.waitForEvent('download');await page.locator(selector).click();const result=await wait;return JSON.parse(await fs.readFile(await result.path(),'utf8'));}
async function importJson(page,obj){await navigate(page,'Réglages');await page.locator('#file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(obj))});await page.waitForFunction(()=>document.getElementById('file').files.length===0);}
async function controlled(page){await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});}

test('UI : migration v1, date seule, vue mensuelle, rapport et export',async()=>{
  const {context,page,errors}=await open();try{
    assert.equal(await page.locator('#total').textContent(),'30,00 €');
    assert.equal(await page.locator('#periodMode').inputValue(),'month');
    assert.equal(await page.locator('#ledgerBalance').count(),0);
    assert.equal(await page.locator('#ledgerPeriodSlot').isVisible(),false);
    assert.equal(await page.locator('#categories').isVisible(),true);
    assert.equal(await page.locator('#ledgerHistory').isVisible(),false);
    assert.equal(await page.locator('#historyToggle').getAttribute('aria-expanded'),'false');
    assert.equal(await page.evaluate(()=>Boolean(document.getElementById('ledgerCategories')
      .compareDocumentPosition(document.getElementById('historyTitle')) & Node.DOCUMENT_POSITION_FOLLOWING)),true);
    assert.equal(await page.locator('#entries .ledger-day time').getAttribute('datetime'),'2026-11-01');
    await page.setViewportSize({width:320,height:740});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.setViewportSize({width:390,height:844});
    await navigate(page,'Budget');
    assert.equal(await page.locator('#plannedIncome').count(),0);
    await page.getByRole('button',{name:'Paie',exact:true}).click();
    assert.equal(await page.locator('#salaryDate').inputValue(),'2026-11-20');
    assert.equal(await page.locator('#salaryForm input').count(),1);
    await page.locator('#salaryDate').fill('');
    await page.locator('#confirmSalary').click();
    assert.equal(await page.locator('#salaryDialog').isVisible(),true);
    await page.locator('#salaryDate').fill('2026-10-25');
    await page.locator('#confirmSalary').click();
    assert.equal(await page.locator('#salaryDialog').isVisible(),false);assert.equal(await page.locator('#periodMode').inputValue(),'cycle');
    const data=await saved(page);
    assert.deepEqual(data.expenses,legacy.expenses);
    assert.equal(data.paydays[0].date,'2026-10-25');
    assert.doesNotMatch(JSON.stringify(data),/"(?:netCents|incomeCents)"/);
    assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),B.KEYS.legacy),legacy);
    await navigate(page,'Analyses');await page.locator('#analyzeCurrent').click();await page.locator('#analyzeMonth').click();
    const report=await page.locator('#analysisText').inputValue();
    assert.match(report,/2026-10-25 \|/);
    assert.match(report,/2026-11-01 \|/);
    assert.doesNotMatch(report,/salaire|revenu|budget variable restant/i);
    assert.match(report,/Complétude/);
    await page.locator('#closeMonthDialog').click();
    const exported=await download(page,'#export');assert.deepEqual(exported.expenses,legacy.expenses);assert.equal(exported.version,3);
    await navigate(page,'Dépenses');await page.locator('#ledgerFilter').click();await page.locator('#periodMode').selectOption('month');assert.equal(await page.locator('#total').textContent(),'30,00 €');await page.locator('#prev').click();assert.equal(await page.locator('#total').textContent(),'30,00 €');
    await page.locator('#periodMode').selectOption('cycle');
    assert.equal(await page.locator('#total').textContent(),'50,00 €');
    assert.match(await page.locator('#ledgerCycle').textContent(),/Cycle en cours depuis le/);
    assert.deepEqual(await page.locator('#entries .ledger-day time').evaluateAll(days=>days.map(day=>day.dateTime)),['2026-11-01','2026-10-25']);
    await page.locator('#ledgerFilter').click();
    if(process.env.SCREENSHOT_DIR){await fs.mkdir(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'cycle-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'cycle-desktop.png'),fullPage:true});}
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : doublon rejeté, correction et annulation sans perte',async()=>{
  const {context,page,errors}=await open();try{await salary(page);await salary(page);assert.equal(await page.locator('#salaryError').isVisible(),true);assert.match(await page.locator('#salaryError').innerText(),/déjà/);await page.locator('#closeSalary').click();
    await salary(page,'2026-11-20');assert.equal((await saved(page)).paydays.length,2);
    await page.getByText('Paies enregistrées et corrections',{exact:true}).click();await page.getByRole('button',{name:'Corriger la paie du 2026-10-25',exact:true}).click();await page.locator('#salaryDate').fill('2026-10-24');await page.locator('#confirmSalary').click();
    assert.equal((await saved(page)).paydays[0].date,'2026-10-24');
    await page.getByRole('button',{name:'Annuler la paie du 2026-11-20',exact:true}).click();assert.equal((await saved(page)).paydays.length,1);assert.deepEqual((await saved(page)).expenses,legacy.expenses);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : dépenses et catégories existantes, édition et suppression',async()=>{
  const {context,page,errors}=await open();try{await page.getByRole('button',{name:'Ajouter une dépense dans Bouffe',exact:true}).click();await page.locator('#amount').fill('0,10');await page.locator('#date').fill('2026-11-20');await page.locator('#submit').click();assert.equal((await saved(page)).expenses.at(-1).cents,10);
    await page.locator('#historyToggle').click();assert.equal(await page.locator('#entries').isVisible(),true);await page.locator('#entries .edit').first().click();await page.locator('#amount').fill('0,20');await page.locator('#expenseKind').selectOption('bitcoin');await page.locator('#submit').click();assert.equal((await saved(page)).expenses.at(-1).kind,'bitcoin');
    await page.locator('#entries .edit').first().click();await page.locator('#delete').click();assert.deepEqual((await saved(page)).expenses,legacy.expenses);
    await navigate(page,'Réglages');await page.locator('#manage').click();await page.locator('#newCat').fill('Santé');await page.locator('#addCat').click();await page.getByLabel('Renommer Santé',{exact:true}).fill('Soins');await page.getByLabel('Renommer Santé',{exact:true}).press('Tab');assert.ok((await saved(page)).categories.includes('Soins'));await page.getByRole('button',{name:'Supprimer Factures',exact:true}).click();const result=await saved(page);assert.equal(result.expenses.length,3);assert.equal(result.expenses.find(e=>e.id==='old2').category,'Autres');assert.equal(result.expenses.find(e=>e.id==='old2').cents,2000);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : import et export v1/v2/v3, JSON invalide refusé',async()=>{
  const {context,page,errors}=await open();
  try{
    await importJson(page,v2);
    const migrated=await saved(page);
    assert.deepEqual(migrated.expenses,v2.expenses);
    assert.deepEqual(migrated.portfolio,v2.portfolio);
    assert.deepEqual(migrated.goals,v2.goals);
    assert.equal(migrated.paydays[0].date,v2.paydays[0].date);
    await navigate(page,'Budget');
    await page.getByText('Paies enregistrées et corrections',{exact:true}).click();
    assert.equal(await page.locator('#salaryList .salary-row span').textContent(),v2.paydays[0].date);
    const exported=await download(page,'#export');
    assert.doesNotMatch(JSON.stringify(exported),/"(?:netCents|incomeCents)"/);
    await importJson(page,legacy);
    assert.equal((await saved(page)).paydays.length,0);
    assert.deepEqual((await saved(page)).expenses,legacy.expenses);
    await importJson(page,exported);
    assert.equal((await saved(page)).paydays.length,1);
    const before=await saved(page);
    await importJson(page,{...legacy,expenses:[...legacy.expenses,{...legacy.expenses[0]}]});
    assert.deepEqual(await saved(page),before);
    assert.match(await page.locator('#toast').innerText(),/Import impossible/);
    await importJson(page,{...exported,version:99});
    assert.deepEqual(await saved(page),before);
    assert.deepEqual(errors,[]);
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
test('UI : le budget affiche les saisies et objectifs de dépense du cycle',async()=>{
  const {context,page,errors}=await open(null);
  try{
    await navigate(page,'Budget');
    await page.getByText('Prévisions budgétaires',{exact:true}).click();
    await page.locator('#dcaWeekday').selectOption('1');
    await page.getByRole('button',{name:'Enregistrer les prévisions',exact:true}).click();
    await salary(page,'2026-02-02');await salary(page,'2026-03-02');await page.locator('#prev').click();
    const add=async(amount,kind)=>{await navigate(page,'Dépenses');await page.locator('#addExpense').click();await page.locator('#ledgerCategory').selectOption('Bouffe');await page.locator('#amount').fill(amount);await page.locator('#date').fill('2026-02-03');await page.locator('#expenseKind').selectOption(kind);await page.locator('#submit').click();await navigate(page,'Budget');};
    await add('100','variable');
    await add('1120','fixed');
    await add('40','bitcoin');
    await add('200','savings');
    const content=await page.locator('#budgetContent').innerText();
    assert.match(content,/Dépenses variables enregistrées à date : 100,00/);
    assert.match(content,/Charges fixes : 1.120,00.*enregistrés, 1.100,00.*prévus/);
    assert.match(content,/DCA Bitcoin : 40,00.*enregistrés, 40,00.*prévus.*4 échéances/);
    assert.doesNotMatch(content,/salaire|revenu|budget restant/i);
    assert.equal((await saved(page)).expenses.length,4);
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
test('UI : hors ligne, redémarrage, paie, dépense, rapport, export et import',{skip:!!process.env.FILE_MODE,timeout:90000},async()=>{
  // A dedicated persistent profile allows a genuine Chromium shutdown/restart.
  // Never use the user's normal Chrome/Edge profile. Do not reseed after reopening.
  const profileRoot=process.env.BROWSER_PROFILE_DIR||require('node:os').tmpdir();
  const profile=await fs.mkdtemp(path.join(profileRoot,'mes-depenses-'));
  let context,page;const errors=[];
  const start=async(offline)=>{context=await chromium.launchPersistentContext(profile,{...launchOptions,offline,viewport:{width:390,height:844},timezoneId:'Europe/Paris'});page=context.pages()[0]||await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());await page.clock.install({time:new Date('2026-11-20T12:00:00Z')});};
  try{
    await start(false);await context.addInitScript(({seed,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed))},{seed:legacy,key:B.KEYS.legacy});await page.goto(url+'/');await controlled(page);await salary(page);const beforeClose=await saved(page);
    await context.close();context=null;
    await start(true);await page.goto(url+'/');await navigate(page,'Budget');await page.waitForSelector('#receiveSalary');assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller));assert.deepEqual(await saved(page),beforeClose);
    await salary(page,'2026-11-20');await navigate(page,'Dépenses');await page.locator('#addExpense').click();await page.locator('#ledgerCategory').selectOption('Bouffe');await page.locator('#amount').fill('12,34');await page.locator('#submit').click();await page.reload();assert.equal((await saved(page)).expenses.length,4);await page.locator('#ledgerFilter').click();assert.equal(await page.locator('#periodMode').inputValue(),'cycle');assert.match(await page.locator('#month').textContent(),/^2026-11-20/);await navigate(page,'Analyses');await page.locator('#analyzeCurrent').click();await page.locator('#analyzeMonth').click();assert.match(await page.locator('#analysisText').inputValue(),/12,34/);await page.locator('#closeMonthDialog').click();const exported=await download(page,'#export');await importJson(page,exported);assert.deepEqual((await saved(page)).expenses,exported.expenses);assert.deepEqual(errors,[]);
  }finally{await context?.close();console.log('Profil synthétique de validation conservé : '+profile)}
});
test('UI : mise à jour vers v34, migration après une paie confirmée hors ligne',{skip:!process.env.BASELINE_DIR||!!process.env.FILE_MODE,timeout:45000},async()=>{
  const previousCache=process.env.BASELINE_CACHE||'mes-depenses-v32';
  upgrade=false;
  const {context,page,errors}=await open(null,'/upgrade/');
  try{
    await controlled(page);
    assert.equal(await page.evaluate(cache=>caches.has(cache),previousCache),true);
    const raw=JSON.stringify(v2);
    await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:B.KEYS.current,raw});
    await page.reload();
    assert.equal(await page.locator('#periodMode').inputValue(),'cycle');
    upgrade=true;
    await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      const activated=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      await registration.update();
      await activated;
    });
    await page.waitForFunction(async cache=>await caches.has('mes-depenses-v34')&&!await caches.has(cache),previousCache);
    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.locator('#addExpense').isVisible(),true);
    assert.equal(await page.locator('#periodMode').inputValue(),'cycle');
    assert.equal(await page.locator('#ledgerBalance').count(),0);
    assert.deepEqual(await saved(page),v2);
    await salary(page,'2026-11-20');
    await page.reload();
    assert.equal(await page.locator('#periodMode').inputValue(),'cycle');
    assert.match(await page.locator('#month').textContent(),/^2026-11-20/);
    const migrated=await saved(page);
    assert.deepEqual(migrated.expenses,v2.expenses);
    assert.deepEqual(migrated.portfolio,v2.portfolio);
    assert.deepEqual(migrated.goals,v2.goals);
    assert.equal(B.cycles(migrated)[0].end,'2026-11-20');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),B.KEYS.beforeV3),raw);
    assert.doesNotMatch(JSON.stringify(migrated),/"(?:netCents|incomeCents)"/);
    assert.deepEqual(errors,[]);
  }finally{await context.close();upgrade=true}
});

test('UI : une paie garde son identifiant indépendant du paiement Bitstack en attente',async()=>{
  const {context,page,errors}=await open();
  try{
    const id='12345678-0000-3000-8000-123456789abc';
    await page.evaluate(fragment=>{location.hash=fragment},'#bitstack?'+new URLSearchParams({
      id,cents:'1490',date:'2026-11-20',merchant:'RESTO RENAISSANCE DE'
    }));
    await page.locator('#merchantField').waitFor({state:'visible'});
    await salary(page,'2026-11-20');
    const state=await saved(page);
    assert.equal(state.paydays.length,1);
    assert.notEqual(state.paydays[0].id,'bitstack-'+id);
    assert.deepEqual(state.expenses,legacy.expenses);
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});

test('UI : un lien Bitstack invalide ne remplace pas la saisie et une annulation ne sauvegarde rien',async()=>{
  const {context,page,errors}=await open();
  try{
    const payment={id:'12345678-0000-3000-8000-123456789abc',cents:'1490',date:'2026-11-20',merchant:'RESTO RENAISSANCE DE'};
    const send=values=>page.evaluate(fragment=>{location.hash=fragment},'#bitstack?'+new URLSearchParams(values));
    await page.locator('#addExpense').click();
    await page.locator('#amount').fill('9,75');
    for(const changes of [{id:'invalid'},{cents:'-1490'},{cents:'9007199254740992'},{date:'2026-02-30'},{date:'2026-11-21'},{merchant:''},{merchant:'x'.repeat(81)}]){
      await send({...payment,...changes});
      await page.waitForFunction(()=>location.hash==='');
      assert.match(await page.locator('#toast').textContent(),/invalide/);
      assert.equal(await page.locator('#amount').inputValue(),'9,75');
      assert.equal(await saved(page),null);
    }
    page.removeAllListeners('dialog');
    page.once('dialog',dialog=>dialog.dismiss());
    await send(payment);
    await page.waitForFunction(()=>location.hash==='');
    assert.equal(await page.locator('#amount').inputValue(),'9,75');
    page.once('dialog',dialog=>dialog.accept());
    await send(payment);
    await page.locator('#merchantField').waitFor({state:'visible'});
    await page.locator('#cancel').click();
    assert.equal(await page.locator('#form').isVisible(),false);
    assert.equal(await saved(page),null);
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});

test('UI : paiement Bitstack prérempli, confirmé une seule fois et disponible hors ligne',
  {skip:!!process.env.FILE_MODE},async()=>{
  const {context,page,errors}=await open();
  try{
    await controlled(page);
    await context.setOffline(true);
    const link='#bitstack?'+new URLSearchParams({
      id:'12345678-0000-3000-8000-123456789abc',
      cents:'1490',
      date:'2026-11-20',
      merchant:'RESTO RENAISSANCE DE'
    });
    await page.goto(url+'/index.html'+link);
    await page.locator('#form').waitFor({state:'visible'});
    assert.equal(await page.locator('#amount').inputValue(),'14,90');
    assert.equal(await page.locator('#merchant').inputValue(),'RESTO RENAISSANCE DE');
    assert.equal(await page.locator('#ledgerCategory').inputValue(),'');
    assert.equal(await saved(page),null);
    await page.locator('#ledgerCategory').selectOption('Bouffe');
    await page.locator('#submit').click();
    const imported=(await saved(page)).expenses.filter(e=>e.id.startsWith('bitstack-'));
    assert.equal(imported.length,1);
    assert.equal(imported[0].description,'RESTO RENAISSANCE DE');
    assert.equal(imported[0].cents,1490);
    await page.evaluate(fragment=>{location.hash=fragment},link);
    await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('déjà enregistré'));
    assert.equal((await saved(page)).expenses.length,legacy.expenses.length+1);
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
