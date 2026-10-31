// Pfeilerl-Tests ohne Browser: lädt src/app.js in einer simulierten Umgebung.
// Aufruf: npm test
const vm=require('vm'),fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','src','app.js'),'utf8').replace('/*CAMERA*/',()=>fs.readFileSync(path.join(__dirname,'..','src','camera.js'),'utf8'));
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

  console.log('Sicherheit: fremde Daten');
  {const {api}=env();
   const u=api.untrusted({name:'<img src=x onerror="x()">',score:'<b>1</b>',n:NaN,arr:[1,'<i>'],['__proto__']:{evil:1},o:{deep:'`a`'}});
   ok(![u.name,u.score,u.arr[1],u.o.deep].some(x=>/[<>"`]/.test(x))&&u.n===0,'HTML-Zeichen und NaN werden entfernt',JSON.stringify(u));
   ok(!Object.keys(u).includes('__proto__')&&u.evil===undefined,'__proto__ wird verworfen');
   ok(!api.validGame({mode:'gibtsnicht',players:[{}],cur:0})&&!api.validGame({mode:'x01',players:[{}],cur:3})&&api.validGame({mode:'x01',players:[{}],cur:0}),'Unbekannte Modi und falsche Indizes werden abgelehnt');
   ok(api.validCode('K7QZD')&&!api.validCode('AB/CD')&&!api.validCode('abc'),'Codes nur aus 5 Buchstaben oder Ziffern');
   const n=api.mergeBackup({app:'pfeilerl',records:[{id:'x1',ts:1,mode:'x01',opts:{},players:[{name:'A',darts:'<img src=x onerror=alert(1)>'}]}],sets:[{id:'" onclick="alert(1)',name:'Böse'}],regulars:[]});
   ok(n.sets===0&&!/[<>]/.test(JSON.stringify(api.localRecs())),'Sicherungsdatei: Codes entfernt, ungültige Set-IDs abgelehnt');}

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

  console.log('Online: manipulierter Spielstand vom Gegner');
  {const A=env({withClaude:true,name:'c'}),B=env({withClaude:true,name:'d'});
   A.api.setup.players=[{name:'Cleo'},{name:'Dan'}];A.api.setup.mode='x01';
   A.api.setup.opts.x01={start:301,out:'double',in:'straight',legs:1,sets:1};
   await A.api.onlClick({dataset:{act:'online'}});await sleep(10);
   await A.api.onlClick({dataset:{act:'onlcreate'}});await sleep(20);
   const code=A.api.getOnl().code;
   B.els.onlcode={value:code};
   await B.api.onlClick({dataset:{act:'onljoin'}});await sleep(10);
   await B.api.onlClick({dataset:{ojseat:'1'}});await sleep(20);
   const g=JSON.parse(JSON.stringify(A.api.getGame()));g.players[0].score='<img src=x onerror=alert(1)>';g.players[0].name='"><script>';
   await fakeDb.doc('online/'+code).set({state:JSON.stringify({g,h:[]}),rev:9999,ts:Date.now()});await sleep(20);
   const bg=B.api.getGame();
   ok(bg&&!/[<>"]/.test(String(bg.players[0].score)+bg.players[0].name),'Werte vom Gegner kommen bereinigt an',bg&&bg.players[0].score);
   const bad=JSON.parse(JSON.stringify(g));bad.mode='gibtsnicht';
   await fakeDb.doc('online/'+code).set({state:JSON.stringify({g:bad,h:[]}),rev:10000,ts:Date.now()});await sleep(20);
   ok(B.api.getGame().mode==='x01','Kaputter Spielstand vom Gegner wird ignoriert');}

  console.log('Kamera-Fehlermeldungen');
  {const {api}=env();
   ok(/Zulassen/.test(api.camErrText({name:'NotAllowedError'}))&&/Windows/.test(api.camErrText({name:'NotAllowedError'})),'Verweigert: Hinweis auf Browser und Windows');
   ok(/anderen Programm/.test(api.camErrText({name:'NotReadableError'})),'Belegt: Hinweis auf anderes Programm');
   ok(/Keine Kamera/.test(api.camErrText({name:'NotFoundError'})),'Nicht gefunden: Hinweis auf USB');
   ok(/\(Seltsam\)/.test(api.camErrText({name:'Seltsam'})),'Unbekannt: Fehlername wird angezeigt');}

  console.log('Online: Codes und Aufräumen');
  {const {api}=env();
   const cs=Array.from({length:200},()=>api.makeCode());
   ok(cs.every(c=>/^[A-HJ-NP-Z2-9]{5}$/.test(c))&&new Set(cs).size>190,'Codes: 5 Zeichen, ohne 0/O/1/I, zufällig');
   const A=env({withClaude:true,name:'e'}),B=env({withClaude:true,name:'f'});
   await fakeDb.doc('online/ALT23').set({state:'{}',rev:1,ts:Date.now()-25*3600*1000});await sleep(5);
   B.els.onlcode={value:'ALT23'};await B.api.onlClick({dataset:{act:'online'}});await sleep(10);await B.api.onlClick({dataset:{act:'onljoin'}});await sleep(10);
   ok(/Kein laufendes Spiel/.test(B.els.app.innerHTML),'Spiel älter als 24 Stunden lässt sich nicht mehr betreten',B.els.app.innerHTML.slice(0,120));
   A.api.setup.players=[{name:'Gina'},{name:'Hans'}];A.api.setup.mode='x01';
   await A.api.onlClick({dataset:{act:'online'}});await sleep(10);await A.api.onlClick({dataset:{act:'onlcreate'}});await sleep(20);
   const code=A.api.getOnl().code;const before=(await fakeDb.doc('online/'+code).get()).exists;
   A.api.endGameForTest();await sleep(20);
   ok(before&&!(await fakeDb.doc('online/'+code).get()).exists,'Gastgeber beendet: gemeinsames Spiel wird gelöscht');}

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

  console.log('Kamera: schräge Kameras wie bei Autodarts');
  {const {api}=env();
   // Lochkamera am Ring: Position in mm (Board in der Ebene z=0, Spieler bei z>0), Blick auf die Board-Mitte
   const mkCam=(ang,dist,height,f,ar)=>{
     const C=[dist*Math.sin(ang),dist*Math.cos(ang),height],t=[0,0,0];
     const z=[t[0]-C[0],t[1]-C[1],t[2]-C[2]],nz=Math.hypot(...z),Z=z.map(v=>v/nz);
     let X=[Z[1]*0-Z[2]*0,Z[2]*0-Z[0]*1,Z[0]*0-Z[1]*0];// up-Hilfsvektor (0,0,1) quer zu Z
     X=[Z[1]*1-Z[2]*0,Z[2]*0-Z[0]*1,0];const nx=Math.hypot(...X);X=X.map(v=>v/nx);
     const Y=[Z[1]*X[2]-Z[2]*X[1],Z[2]*X[0]-Z[0]*X[2],Z[0]*X[1]-Z[1]*X[0]];
     return (px,py,pz=0)=>{const d=[px-C[0],py-C[1],pz-C[2]],xc=d[0]*X[0]+d[1]*X[1]+d[2]*X[2],yc=d[0]*Y[0]+d[1]*Y[1]+d[2]*Y[2],zc=d[0]*Z[0]+d[1]*Z[1]+d[2]*Z[2];
       return [0.5+f*xc/zc,0.5-f*ar*yc/zc];};};
   // drei Kameras im 120-Grad-Abstand am Ring (Radius 250 mm), 90 mm vor der Scheibe, 16:9
   const cams=[0,120,240].map(g=>mkCam(g*Math.PI/180+0.3,250,90,0.55,16/9));
   const CAL=[[0,0],[0,170],[170,0],[0,-170],[-170,0]];
   const cals=cams.map(pr=>api.fitCal(CAL.map(([X,Y])=>{const [ix,iy]=pr(X,Y);return {X,Y,ix,iy};})));
   ok(cals.every(c=>c.H&&c.angled&&c.err<1e-6),'Homographie aus 5 Punkten exakt, als schräg erkannt',cals.map(c=>c.err).join(', '));
   let maxE=0;for(let k=0;k<300;k++){const X=(Math.random()*2-1)*170,Y=(Math.random()*2-1)*170;cams.forEach((pr,i)=>{const [u,v]=pr(X,Y),Q=api.invH(cals[i].H,u,v);maxE=Math.max(maxE,Math.hypot(Q[0]-X,Q[1]-Y));});}
   ok(maxE<0.01,'Bildpunkt zurück aufs Board auf 0,01 mm genau',maxE);
   // Würfe: Spitze auf dem Board, je Kamera die Bildposition der Spitze
   const hits=[[0,103,'T20'],[166*Math.sin(Math.PI/180*18),166*Math.cos(Math.PI/180*18),'D1'],[0,0,'50'],[-134,0,'S11'],[-134*Math.sin(Math.PI/180*72),134*Math.cos(Math.PI/180*72),'S14']];
   let good=0;const got=[];
   hits.forEach(([X,Y,want])=>{const tips=cams.map((pr,i)=>{const [x,y]=pr(X,Y);return {c:cals[i],t:{x,y}};});const P=api.locate(tips);const d=P&&api.classify(P[0],-P[1]);
     const lab=d?(d.seg===25?(d.mult===2?'50':'25'):(['','S','D','T'][d.mult]+d.seg)):'–';got.push(lab);if(lab===want) good++;});
   ok(good===hits.length,'T20, D1, Bull, S11 und S14 aus drei schrägen Kameras richtig erkannt',got.join(', '));
   const one=api.locate([{c:cals[1],t:(()=>{const [x,y]=cams[1](0,103);return {x,y};})()}]);
   ok(one&&Math.hypot(one[0],one[1]-103)<0.5,'Eine schräge Kamera allein findet den Punkt auch',one&&one.map(v=>v.toFixed(2)).join(', '));
   // flache Kamera (knapp über der Oberfläche) bleibt flach
   const flat=mkCam(0.3,260,8,0.6,16/9);
   ok(!api.fitCal(CAL.map(([X,Y])=>{const [ix,iy]=flat(X,Y);return {X,Y,ix,iy};})).angled,'Flach blickende Kamera wird als flach erkannt');
   ok(api.ncc([1,2,3,4,5],[2,4,6,8,10])>0.99&&api.ncc([1,2,3,4,5],[5,4,3,2,1])<0,'Bildvergleich: Helligkeit egal, Verschiebung erkannt');}

  console.log('Kamera: automatische Kalibrierung');
  {const {api}=env();
   const SEGS=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
   // Kamera am Ring wie in echt (Bild-oben mit Anteil zum Spieler hin), Bild 480×270
   const mk=(ang,dist,h,f,ar)=>{const C=[dist*Math.sin(ang),dist*Math.cos(ang),h],nrm=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},cr=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
     const Z=nrm([-C[0],-C[1],-C[2]]),X=nrm(cr(Z,[0,0,1])),Y=cr(X,Z);
     return (px,py)=>{const d=[px-C[0],py-C[1],-C[2]],xc=d[0]*X[0]+d[1]*X[1]+d[2]*X[2],yc=d[0]*Y[0]+d[1]*Y[1]+d[2]*Y[2],zc=d[0]*Z[0]+d[1]*Z[1]+d[2]*Z[2];return [0.5+f*xc/zc,0.5-f*ar*yc/zc];};};
   const W=480,Hh=270,colOf=(X,Y)=>{const r=Math.hypot(X,Y);if(r>225) return [138,143,150];if(r>200) return [232,232,232];
     let a=Math.atan2(X,Y)*180/Math.PI;if(a<0)a+=360;const k=Math.floor(((a+9)%360)/18),even=k%2===0;
     if(r>170){const half=SEGS[k]>=10?4.2:2,off=Math.abs(((a-k*18+540)%360)-180);return r>182&&r<195&&off<half?[242,242,242]:[28,28,28];}
     if(r<=6.35) return [196,38,44];if(r<=15.9) return [27,117,70];
     if((r>=99&&r<=107)||r>=162) return even?[196,38,44]:[27,117,70];return even?[31,32,29]:[237,226,196];};
   let ok3=0;const info=[],prec=[];
   for(const g of [17,137,257]){
     const pr=mk(g*Math.PI/180,260,70,0.62,16/9),T=[[0,170],[170,0],[0,-170],[-170,0]].map(([X,Y])=>{const [u,v]=pr(X,Y);return [u*W,v*Hh];}),Ht=api.acH(T);
     const data=new Uint8ClampedArray(W*Hh*4);
     for(let y=0;y<Hh;y++) for(let x=0;x<W;x++){const P=api.invH(Ht,x+0.5,y+0.5),c=P?colOf(P[0],P[1]):[138,143,150],j=(y*W+x)*4;data[j]=c[0];data[j+1]=c[1];data[j+2]=c[2];data[j+3]=255;}
     const r=api.autoCalibrate({width:W,height:Hh,data});
     if(!r.ok){info.push('nicht gefunden');continue;}
     // Fehler in mm auf dem Board bei der wahrscheinlichsten Lage, und ob die richtige unter den Kandidaten ist
     const errOf=pts=>{const H=api.acH([1,2,3,4].map(k=>[pts[k].ix*W,pts[k].iy*Hh]));let mx=0;for(let X=-150;X<=150;X+=30) for(let Y=-150;Y<=150;Y+=30){if(Math.hypot(X,Y)>170) continue;const [u,v]=api.projH(Ht,X,Y),Q=api.invH(H,u,v);mx=Math.max(mx,Math.hypot(Q[0]-X,Q[1]-Y));}return mx;};
     const best=Math.min(...r.alts.map(errOf)),first=errOf(r.pts);
     info.push(`max ${best.toFixed(1)} mm, Selbstprüfung ${r.stats?r.stats.rel.toFixed(2)+' %':'–'}${first<10?'':' (erst nach Würfen)'}`);
     if(best<10) ok3++;
     if(r.stats) prec.push(r.stats);
   }
   const worst=k=>Math.max(...prec.map(s=>s[k]));
   ok(prec.length===3&&worst('rel')<0.5&&worst('rad')<0.5&&worst('ang')<0.3&&worst('ctr')<0.5,'Selbstprüfung nach Kantenverfeinerung: Reprojektion < 0,5 %, Radien und Zentrum < 0,5 mm, Winkel < 0,3°',
     prec.map(s=>`${s.rel.toFixed(2)} %, ${s.rad.toFixed(2)} mm, ${s.ang.toFixed(2)}°, ${s.ctr.toFixed(2)} mm`).join(' | '));
   ok(ok3===3,'Drei simulierte Kameras ohne Klicken kalibriert, richtige Lage unter den Kandidaten (Würfe klären sie)',info.join(' | '));}

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  process.exit(failed?1:0);
})();
