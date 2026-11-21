// Service-worker tests use an in-memory Cache API and network: no browser restrictions are bypassed.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../sw.js'),'utf8');
function runtime({offline=false,missingAsset=false}={}){
  const listeners={},stores=new Map([['mes-depenses-v20',new Map()],['other-application',new Map()]]),network=[];let skipped=false,claimed=false;
  const key=x=>new URL(typeof x==='string'?x:x.url,'https://example.test/Mes-Depenses/sw.js').href;
  const caches={keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {addAll:async assets=>{if(missingAsset)throw Error('Asset missing');for(const asset of assets)store.set(key(asset),{asset,release:21})},match:async request=>store.get(key(request))}}};
  const scope={caches,URL,fetch:async request=>{network.push(request);if(offline)throw Error('offline');return {network:true}},self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{skipped=true},clients:{claim:async()=>{claimed=true}}}};
  vm.runInNewContext(source,scope);
  const lifecycle=async name=>{let pending;listeners[name]({waitUntil:p=>pending=p});await pending};
  const request=async(url,{method='GET',mode='navigate'}={})=>{let response;listeners.fetch({request:{url,method,mode},respondWith:p=>response=p});return response?await response:null};
  return {lifecycle,request,stores,network,get skipped(){return skipped},get claimed(){return claimed}};
}
test('cache installable complet, incluant le moteur budgétaire',async()=>{const r=runtime();await r.lifecycle('install');assert.equal(r.skipped,true);const cached=r.stores.get('mes-depenses-v21');for(const asset of ['index.html','budget.js','manifest.webmanifest','icon.svg'])assert.ok(cached.has('https://example.test/Mes-Depenses/'+asset));});
test('mise à jour incomplète refusée, ancien cache conservé',async()=>{const r=runtime({missingAsset:true});await assert.rejects(r.lifecycle('install'));assert.equal(r.skipped,false);assert.ok(r.stores.has('mes-depenses-v20'));});
test('activation remplace seulement les caches de cette application',async()=>{const r=runtime();await r.lifecycle('install');await r.lifecycle('activate');assert.equal(r.stores.has('mes-depenses-v20'),false);assert.equal(r.stores.has('other-application'),true);assert.equal(r.claimed,true);});
test('navigation hors ligne : racine, index et paramètres retournent le HTML en cache',async()=>{const r=runtime({offline:true});await r.lifecycle('install');for(const path of ['/Mes-Depenses/','/Mes-Depenses/index.html','/Mes-Depenses/?test=1'])assert.equal((await r.request('https://example.test'+path)).asset,'./index.html');assert.equal(r.network.length,0);});
test('hors ligne : moteur, icône et manifeste servis depuis la même version',async()=>{const r=runtime({offline:true});await r.lifecycle('install');for(const name of ['budget.js','icon.svg','manifest.webmanifest'])assert.equal((await r.request('https://example.test/Mes-Depenses/'+name,{mode:'cors'})).release,21);assert.equal(r.network.length,0);});
test('pas de mélange HTML réseau et ancien module pendant une mise à jour',async()=>{const r=runtime();await r.lifecycle('install');assert.equal((await r.request('https://example.test/Mes-Depenses/')).release,21);assert.equal((await r.request('https://example.test/Mes-Depenses/budget.js',{mode:'cors'})).release,21);assert.equal(r.network.length,0);});
test('requêtes externes et mutations ignorées',async()=>{const r=runtime();assert.equal(await r.request('https://external.test/'),null);assert.equal(await r.request('https://example.test/Mes-Depenses/',{method:'POST'}),null);});
