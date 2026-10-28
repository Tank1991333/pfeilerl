// Pfeilerl-Tests ohne Browser: lädt src/app.js in einer simulierten Umgebung.
// Aufruf: npm test
const vm=require('vm'),fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','src','app.js'),'utf8');
let passed=0,failed=0;
function ok(cond,name,extra){if(cond){passed++;console.log('  ✓ '+name);}else{failed++;console.log('  ✗ '+name+(extra?'  → '+extra:''));}}

// gemeinsame Fake-Datenbank für Online-Tests
const dbStore={},subs={};
function docRef(p){return{
  get:async()=>({exists:!!dbStore[p],data:()=>dbStore[p]}),
  set:async d=>{dbStore[p]=JSON.parse(JSON.stringify(d));setTimeout(()=>(subs[p]||[]).forEach(f=>f({exists:true,data:()=>dbStore[p]})),1);},
  delete:async()=>{delete dbStore[p];},
  onSnapshot:f=>{(subs[p]=subs[p]||[]).push(f);if(dbStore[p]) setTimeout(()=>f({exists:true,data:()=>dbStore[p]}),1);return()=>{subs[p]=(subs[p]||[]).filter(x=>x!==f);};}
};}
const coll=()=>({doc:id=>docRef('c/'+id),orderBy(){return this;},limit(){return this;},get:async()=>({docs:[]})});
const fakeDb={doc:docRef,collection:coll};

function env({withClaude=false,queueTimers=false,name='a'}={}){
  const els={},ls={},Q=[];
  const mk=id=>els[id]||(els[id]={id,innerHTML:'',textContent:'',hidden:false,value:'',classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},focus(){},remove(){},appendChild(){},disabled:false,onclick:null,dataset:{},style:{},isConnected:true});
  const ctx={console,JSON,Math,Date,Promise,setInterval:()=>0,clearInterval:()=>{},
    setTimeout:queueTimers?(f=>{Q.push(f);return Q.length;}):setTimeout,
    clearTimeout:queueTimers?(()=>{Q.length=0;}):clearTimeout,
    document:{getElementById:mk,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},visibilityState:'visible',createElement:()=>mk('x'+Math.random()),body:{appendChild(){}},documentElement:{}},
    localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;},removeItem:k=>{delete ls[k];}},
    navigator:{},els};
  ctx.window={scrollTo(){},matchMedia:()=>({matches:true}),__pfeilerlTest:api=>{ctx.api=api;},
    claude:withClaude?{use:async n=>n==='db'?fakeDb:n==='user'?{id:async()=>'user-'+name}:null}:undefined};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(SRC,ctx);
  ctx.run=(limit=80000)=>{let n=0;while(Q.length&&n<limit){Q.shift()();n++;}return n;};
  return ctx;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  console.log('Checkout-Vorschläge');
  {const {api}=env();
   const c=(s,d,o)=>JSON.stringify(api.checkout(s,d,o));
   ok(c(170,3,'double')==='["T20","T20","Bull"]','170 = T20 T20 Bull');
   ok(c(100,3,'double')==='["T20","D20"]','100 = T20 D20');
   ok(c(32,1,'double')==='["D16"]','32 = D16');
   ok(api.checkout(169,3,'double')===null,'169 ist nicht checkbar');
   ok(api.checkout(41,1,'double')===null,'41 mit einem Dart nicht checkbar');}

  console.log('Alle Spielmodi mit drei Computer-Gegnern');
  {const e=env({queueTimers:true}),api=e.api;
   for(const m of Object.keys(api.MODES)){
     api.setup.mode=m;
     api.setup.players=[{name:'CPU Profi',bot:4},{name:'CPU Hobby',bot:2},{name:'CPU Liga',bot:3}];
     api.startGame(false);
     e.run();
     const g=api.getGame();
     ok(g&&Array.isArray(g.winner)&&g.winner.length>0,`${api.MODES[m].name} endet mit Sieger`,g&&g.msg);
   }}

  console.log('X01-Logik und Erfolge');
  {const {api}=env();
   api.setup.players=[{name:'Anna'},{name:'Ben'}];api.setup.mode='x01';
   api.setup.opts.x01={start:501,out:'double',in:'straight',legs:1,sets:1};
   api.startGame(false);
   const D=(s,m)=>({seg:s,mult:m}),miss=D(0,0);
   [[D(20,3),D(20,3),D(20,3)],[D(20,3),D(20,3),D(20,3)]].forEach(v=>{v.forEach(api.throwDart);api.nextVisit();[miss,miss,miss].forEach(api.throwDart);api.nextVisit();});
   [D(20,3),D(19,3),D(12,2)].forEach(api.throwDart);
   const g=api.getGame();
   ok(g.winner&&g.winner[0]===0,'Neun-Darter beendet das Spiel');
   const names=api.newAchievements(g).map(x=>x[1]);
   ok(names.includes('Neun-Darter')&&names.includes('Einhundertachtzig'),'Erfolge Neun-Darter und 180 freigeschaltet',names.join(', '));
   api.undo();
   ok(!api.getGame().winner,'Rückgängig nimmt den Siegwurf zurück');
   api.setup.opts.x01={start:101,out:'double',in:'straight',legs:1,sets:1};
   api.startGame(false);
   api.throwDart(D(20,3));api.throwDart(D(20,3));
   const b=api.getGame();
   ok(b.bust&&b.locked&&b.players[0].score===101,'Überwerfen setzt die Aufnahme zurück');}

  console.log('Version');
  {const {api}=env();ok(api.VERSION==='Entwicklung','Ohne Build steht „Entwicklung“ statt einer Nummer');
   const b=fs.readFileSync(path.join(__dirname,'..','scripts','build.mjs'),'utf8');
   ok(b.includes("replaceAll('__VERSION__',version)"),'Build setzt die Version aus package.json ein');}

  console.log('Startseite, Stammspieler und Datensicherung');
  {const e=env(),api=e.api;
   ok(JSON.stringify(api.quickModes())==='["x01","cricket","atc","killer"]','Ohne Verlauf vier beliebte Modi');
   api.setup.players=[{name:'Anna',nick:'Die Rakete'},{name:'Spieler 2'},{name:'CPU Profi',bot:4}];api.setup.mode='golf';
   api.startGame(false);
   ok(api.quickModes()[0]==='golf','Gespielter Modus steht oben');
   ok(api.setup.regulars.length===1&&api.setup.regulars[0].name==='Anna'&&api.setup.regulars[0].nick==='Die Rakete','Nur echte Namen werden Stammspieler, mit Profil');
   api.setup.players=[{name:'Spieler 1'},{name:'Ben'}];api.addRegular('Anna');
   ok(api.setup.players[0].name==='Anna'&&api.setup.players[0].nick==='Die Rakete'&&api.setup.players.length===2,'Stammspieler ersetzt einen Standardnamen');
   const rec={id:'r1',ts:1,mode:'x01',opts:{},players:[{name:'Anna',won:true}]};
   const n1=api.mergeBackup({app:'pfeilerl',records:[rec,{id:'r2',ts:2,mode:'x01',opts:{},players:[]}],sets:[{id:'s1',name:'Blau'}],regulars:[{name:'Cleo'}]});
   const n2=api.mergeBackup({app:'pfeilerl',records:[rec],sets:[],regulars:[]});
   ok(n1.games===2&&n2.games===0&&api.localRecs().length===2,'Wiederherstellen fügt nur fehlende Spiele hinzu');
   ok(api.setup.sets.some(s=>s.id==='s1')&&api.setup.regulars.some(r=>r.name==='Cleo'),'Dart-Sets und Stammspieler kommen mit');
   let bad=false;try{api.mergeBackup({foo:1});}catch(x){bad=true;}
   ok(bad,'Fremde Dateien werden abgelehnt');}

  console.log('Doppelte Namen');
  {const {api}=env();
   ok(api.dupName([{name:'Anna'},{name:' anna '}])==='anna','Gleiche Namen ohne Groß-/Kleinschreibung erkannt');
   ok(api.dupName([{name:''},{name:'Spieler 1'}])==='Spieler 1','Leeres Feld zählt als „Spieler N“');
   ok(api.dupName([{name:'Anna'},{name:'Ben'}])==='','Verschiedene Namen sind in Ordnung');
   api.setup.players=[{name:'Anna'},{name:'anna'}];api.setup.mode='x01';api.startGame(false);
   ok(!api.getGame(),'Spiel mit doppelten Namen startet nicht');}

  console.log('Tastatur');
  {const e=env({queueTimers:true}),api=e.api;
   api.setup.players=[{name:'Anna'},{name:'Ben'}];api.setup.mode='x01';
   api.setup.opts.x01={start:501,out:'double',in:'straight',legs:1,sets:1};
   api.startGame(false);
   const key=k=>api.gameKey({key:k,target:{},preventDefault(){}});
   key('t');key('2');key('0');
   ok(api.getGame().visit.length===1&&api.getGame().visit[0].mult===3&&api.getGame().visit[0].seg===20,'T, 2, 0 ergibt T20');
   key('7');key('2');e.run();
   const v=api.getGame().visit;
   ok(v.length===3&&v[1].seg===7&&v[2].seg===2,'7 sofort, 2 nach kurzer Pause',JSON.stringify(v));
   key('Enter');
   ok(api.getGame().cur===1&&api.getGame().players[0].score===501-60-7-2,'Enter schließt die Aufnahme ab');
   key('Backspace');
   ok(api.getGame().cur===0&&api.getGame().visit.length===3,'Rücktaste nimmt zurück');
   key('Backspace');key('b');
   ok(api.getGame().visit[2].seg===25&&api.getGame().visit[2].mult===2,'B ergibt Bull');}

  console.log('Online-Spiel zwischen zwei Geräten');
  {const A=env({withClaude:true,name:'a'}),B=env({withClaude:true,name:'b'});
   A.api.setup.players=[{name:'Anna'},{name:'Ben'}];A.api.setup.mode='x01';
   A.api.setup.opts.x01={start:301,out:'double',in:'straight',legs:1,sets:1};
   await A.api.onlClick({dataset:{act:'online'}});await sleep(10);
   await A.api.onlClick({dataset:{act:'onlcreate'}});await sleep(20);
   const code=A.api.getOnl().code;
   B.els.onlcode={value:code};
   await B.api.onlClick({dataset:{act:'onljoin'}});await sleep(10);
   await B.api.onlClick({dataset:{ojseat:'1'}});await sleep(20);
   B.api.throwDart({seg:20,mult:3});
   ok(B.api.getGame().visit.length===0,'Ben kann nicht für Anna werfen');
   [1,2,3].forEach(()=>A.api.throwDart({seg:20,mult:3}));A.api.nextVisit();await sleep(20);
   ok(B.api.getGame().players[0].score===121&&B.api.getGame().cur===1,'Bens Gerät sieht Annas 180');}

  console.log('Kamera-Triangulation');
  {const {api}=env();
   const cams=[{a:[0.004,0.0008,0.5],c:[0.0006,0.0011]},{a:[-0.0025,0.0034,0.48],c:[-0.0012,0.0004]},{a:[-0.0016,-0.0036,0.52],c:[0.0009,-0.001]}];
   const proj=(c,X,Y)=>(c.a[0]*X+c.a[1]*Y+c.a[2])/(c.c[0]*X+c.c[1]*Y+1);
   const pts=[[0,0],[0,170],[170,0],[0,-170],[-170,0]];
   const fits=cams.map(c=>api.fitCal(pts.map(([X,Y])=>({X,Y,ix:proj(c,X,Y),iy:0.5}))));
   let good=0;
   for(let k=0;k<200;k++){const X=(Math.random()*2-1)*150,Y=(Math.random()*2-1)*150;
     const lines=fits.map((f,i)=>{const x=proj(cams[i],X,Y);const [a1,a2,a3,c1,c2]=f.p;return [a1-x*c1,a2-x*c2,x-a3];});
     const P=api.triangulate(lines);if(P&&Math.hypot(P[0]-X,P[1]-Y)<1) good++;}
   ok(good===200,'200 von 200 Punkten auf 1 mm genau',good+'/200');
   ok(JSON.stringify(api.classify(0,-103))==='{"seg":20,"mult":3}','Punkt auf T20 wird als T20 erkannt');}

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  process.exit(failed?1:0);
})();
