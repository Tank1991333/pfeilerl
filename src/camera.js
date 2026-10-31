// Kamera-Erkennung von Pfeilerl. scripts/build.mjs und die Tests setzen diese Datei in src/app.js an der
// Platzhalter-Stelle CAMERA ein, sie läuft im selben Gültigkeitsbereich wie der Rest der App.
/* ---------- Kamera ---------- */
const CAL_PTS=[['die Mitte des Bulls',0,0],['den äußeren Draht der Double 20, in der Mitte des Feldes',0,170],['den äußeren Draht der Double 6, in der Mitte des Feldes',170,0],['den äußeren Draht der Double 3, in der Mitte des Feldes',0,-170],['den äußeren Draht der Double 11, in der Mitte des Feldes',-170,0]];
/* Auflösungen wie bei Autodarts. Die Kameras liefern dabei meist MJPEG, so passen auch drei an einen USB-Anschluss. */
const CAM_RES=[{w:1280,h:720,n:'1280×720'},{w:640,h:360,n:'640×360'},{w:640,h:480,n:'640×480 (4:3)'}];
const CAM_FPS=[30,15];
const CAM_SPEED=[['Sehr langsam',250],['Langsam',180],['Standard',120],['Schnell',80],['Sehr schnell',50]];
const CAM_STANDBY=[[0,'Nie'],[5,'5 Min.'],[15,'15 Min.'],[30,'30 Min.']];
let CW=480,CH=270;
const cam={devices:[],slots:store.get('dart.camslots')||[null,null,null],streams:[],videos:[],cal:store.get('dart.camcal')||{},active:false,state:'idle',ref:[],prev:[],still:0,idle:0,timer:null,pv:null,last:'',err:'',sens:1,calSlot:-1,calPts:[],calImg:null,calFit:null,diag:false,thr:28,margin:0.12,lastP:null,
  res:0,fps:30,speed:2,standby:15,check:true,autocal:true,busy:'',health:['','',''],healTimer:null,healing:false,mode:null,masks:[],meas:[0,0,0],moved:[false,false,false],sleeping:false,lastAct:Date.now(),sbTimer:null};
Object.assign(cam,store.get('dart.camset')||{});
const saveCamSet=()=>store.set('dart.camset',{sens:cam.sens,thr:cam.thr,margin:cam.margin,res:cam.res,fps:cam.fps,speed:cam.speed,standby:cam.standby,check:cam.check,autocal:cam.autocal});
let camHost=null,work=null,wctx=null;
function ensureHost(){
  if(camHost) return;
  camHost=document.createElement('div');camHost.setAttribute('aria-hidden','true');camHost.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
  document.body.appendChild(camHost);
  work=document.createElement('canvas');work.width=CW;work.height=CH;wctx=work.getContext('2d',{willReadFrequently:true});
}
/* Rechenauflösung passt sich dem Seitenverhältnis der Kameras an, 480 Pixel breit */
function setWork(ar){
  const h=Math.round(480/ar);if(h===CH&&CW===480) return;
  CW=480;CH=h;if(work){work.width=CW;work.height=CH;}cam.masks=[];cam.ref=[];cam.prev=[];
}
const camAR=i=>{const v=cam.videos[i];return v&&v.videoWidth?v.videoWidth/v.videoHeight:null;};
/* Kamerafehler verständlich erklären, mit Fehlername für die Fehlersuche */
function camErrText(e){
  const n=(e&&e.name)||'Unbekannt';
  if(n==='NotAllowedError'||n==='PermissionDeniedError'||n==='SecurityError') return hasClaude()?
    `Auf claude.ai blockiert der Browser die Kamera meist. Öffne Pfeilerl dafür unter pfeilerl.vercel.app. (${n})`:
    `Die Kamera ist nicht erlaubt. Klick links in der Adressleiste auf das Symbol vor der Adresse, stell „Kamera“ auf „Zulassen“ und lade die Seite neu. Unter Windows zusätzlich prüfen: Einstellungen, Datenschutz und Sicherheit, Kamera, dort „Kamerazugriff“ und „Desktop-Apps den Zugriff auf die Kamera erlauben“ einschalten. (${n})`;
  if(n==='NotFoundError'||n==='OverconstrainedError'||n==='DevicesNotFoundError') return `Keine Kamera gefunden. Prüf das USB-Kabel und ob Windows die Kamera erkennt, etwa in der Kamera-App. (${n})`;
  if(n==='NotReadableError'||n==='TrackStartError'||n==='AbortError') return `Die Kamera wird gerade von einem anderen Programm benutzt. Läuft Autodarts, Teams, Zoom oder die Kamera-App, schließ es ganz (auch im Infobereich der Taskleiste) und tipp erneut auf „Kameras suchen“. (${n})`;
  return `Die Kamera ließ sich nicht starten. (${n})`;
}
async function camScan(){
  cam.err='';
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){cam.err='Dieser Browser erlaubt hier keinen Kamerazugriff. Nutze die installierbare Version im Browser am PC.';return;}
  try{const s=await navigator.mediaDevices.getUserMedia({video:true});s.getTracks().forEach(t=>t.stop());}
  catch(e){cam.err=camErrText(e);return;}
  const all=await navigator.mediaDevices.enumerateDevices();
  cam.devices=all.filter(d=>d.kind==='videoinput').map((d,i)=>({id:d.deviceId,label:d.label||('Kamera '+(i+1))}));
  const ids=cam.devices.map(d=>d.id);
  for(let i=0;i<3;i++) if(!cam.slots[i]||!ids.includes(cam.slots[i])) cam.slots[i]=ids.find(id=>!cam.slots.includes(id))||null;
  store.set('dart.camslots',cam.slots);
  await camStart();
}
/* Stufen für camStart: gewählte Auflösung und Bildrate, dann sparsamer, falls eine Kamera mit
   NotReadableError scheitert (USB-Bandbreite knapp oder Kamera belegt). Seitenverhältnis bleibt gleich. */
function camModes(){
  const r=CAM_RES[cam.res]||CAM_RES[0],wide=r.w/r.h>1.5,small=wide?{w:640,h:360}:{w:320,h:240};
  const list=[{w:r.w,h:r.h,f:cam.fps},{w:r.w,h:r.h,f:15},{w:small.w,h:small.h,f:15},{w:small.w,h:small.h,f:10}];
  return list.filter((m,i)=>list.findIndex(x=>x.w===m.w&&x.h===m.h&&x.f===m.f)===i);
}
const CAM_MODES=camModes();
const camModeText=m=>`${m.w}×${m.h}, ${m.f} Bilder/s`;
function camStop(){
  cam.streams.forEach(s=>s&&s.getTracks().forEach(t=>t.stop()));
  cam.streams=[];cam.videos=[];if(camHost) camHost.innerHTML='';
}
async function camOpen(m){
  camStop();
  const fails=[];
  for(let i=0;i<3;i++){
    const id=cam.slots[i];
    if(!id){cam.streams.push(null);cam.videos.push(null);continue;}
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:id},width:{ideal:m.w},height:{ideal:m.h},aspectRatio:{ideal:m.w/m.h},frameRate:{ideal:m.f}}});
      const v=document.createElement('video');v.muted=true;v.playsInline=true;v.autoplay=true;v.srcObject=s;camHost.appendChild(v);
      await v.play().catch(()=>{});
      cam.streams.push(s);cam.videos.push(v);countFrames(i,v);
    }catch(e){cam.streams.push(null);cam.videos.push(null);fails.push([i,e]);}
  }
  return fails;
}
async function camStart(){
  ensureHost();
  const modes=camModes();let fails=[];
  for(let k=0;k<modes.length;k++){
    fails=await camOpen(modes[k]);cam.mode=modes[k];cam.modeStep=k;
    if(!fails.some(([,e])=>e&&e.name==='NotReadableError')) break;
  }
  cam.sleeping=false;cam.lastAct=Date.now();
  const v=cam.videos.find(Boolean);
  if(v){await new Promise(r=>{if(v.videoWidth) r();else{v.onloadedmetadata=()=>r();setTimeout(r,1500);}});if(v.videoWidth) setWork(v.videoWidth/v.videoHeight);}
  clearInterval(cam.sbTimer);cam.sbTimer=setInterval(standbyCheck,30000);
  clearInterval(cam.healTimer);cam.healTimer=setInterval(()=>selfHeal(false),2000);
  setTimeout(async()=>{if(cam.autocal) await camAutoAll(true);await selfHeal(true);},1500);
  if(!fails.length) return;
  const [i,e]=fails[0];
  cam.err=e&&e.name==='NotReadableError'?
    `Kamera ${i+1} startet nicht, auch nicht mit ${camModeText(cam.mode)}. Meist benutzt ein anderes Programm sie gerade, etwa Autodarts: Das bitte ganz schließen, auch im Infobereich der Taskleiste. Sonst reicht die USB-Bandbreite nicht, dann die Kameras auf verschiedene Anschlüsse verteilen. (${e.name})`:
    `Kamera ${i+1}: ${camErrText(e)}`;
}
/* Gemessene Bildrate je Kamera */
function countFrames(i,v){
  let n=0,t0=performance.now();
  const tick=()=>{if(cam.videos[i]!==v) return;n++;const t=performance.now();if(t-t0>=1000){cam.meas[i]=Math.round(n*1000/(t-t0));n=0;t0=t;}
    if(v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);else setTimeout(tick,33);};
  if(v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);else setTimeout(tick,33);
}
/* Standby: Kameras nach einer Weile ohne Spiel ausschalten, beim nächsten Spiel wieder an */
const camTouch=()=>{cam.lastAct=Date.now();};
function standbyCheck(){
  if(!cam.standby||cam.sleeping||!cam.streams.some(Boolean)) return;
  if(game&&!game.winner) return;
  if(Date.now()-cam.lastAct<cam.standby*60000) return;
  clearInterval(cam.timer);cam.timer=null;camStop();cam.sleeping=true;cam.last='Kameras im Standby, sie starten mit dem nächsten Spiel wieder';
}
/* Selbstheilung alle 2 Sekunden je eine Kamera (jede also alle 6 s), solange gerade kein Dart erkannt wird: Geometrie an den Drähten messen.
   Kleine Abweichung: sanft nachführen. Kamera bewegt: automatisch neu kalibrieren (Lage der 20 bleibt).
   Dazu Hinweise bei Unschärfe und stark verändertem Licht. */
async function selfHeal(all){
  if(cam.sleeping||cam.busy||cam.calSlot>=0||cam.state!=='idle'||cam.healing||!cam.streams.some(Boolean)) return;
  cam.healing=true;let changed=false;
  // Je Durchgang nur eine Kamera (reihum) in 960 Pixel Breite, damit die Oberfläche nicht ruckelt
  const list=all?[0,1,2]:[cam.healIdx=((cam.healIdx??-1)+1)%3];
  try{
    for(const i of list){
      const c=calOf(i);if(!c||!c.H) continue;
      const img=frameImage(i,960);if(!img) continue;
      const E=edgePrep(img),Hpx=hScale(c.H,img.width,img.height),C=edgeMeasure(E,Hpx),st=edgeStats(C,Hpx),br=boardBright(E,Hpx);
      if(!c.stats0){c.stats0=c.stats||st;c.stats=c.stats||st;c.sharp=c.sharp||st.sharp;c.bright=c.bright||br;store.set('dart.camcal',cam.cal);continue;}
      // Maßstab bleibt die Messung direkt nach der Kalibrierung (stats0), damit sich Abweichungen nicht einschleichen
      const msgs=[],base=c.stats0;
      let moved=st.count<base.count*0.45||st.med>Math.max(1.5,base.med*3);
      if(!moved&&st.count>=40&&st.med>Math.max(0.5,base.med*1.5)){
        // kleine Drift (Wärme, Erschütterung): an den Kanten nachführen, Lage der 20 bleibt
        const ref=edgeRefine(img,Hpx);
        // nur übernehmen, wenn so gut wie direkt nach der Kalibrierung, sonst ganz neu kalibrieren
        if(ref.stats.count>=40&&ref.stats.rel<Math.min(CAL_OK,Math.max(0.25,base.rel*1.5))){
          const pts=CAL_PTS.map(([,X,Y])=>{const [u,v]=projH(ref.H,X,Y);return {X,Y,ix:u/img.width,iy:v/img.height};}),fit=fitCal(pts);
          if(fit.p&&fit.H){Object.assign(c,fit,{pts,stats:ref.stats});altCache.delete(c);cam.masks=[];cam.ref=[];store.set('dart.camcal',cam.cal);changed=true;}
        }else moved=true;// Nachführen reicht nicht: ganz neu kalibrieren
      }
      if(moved){
        if(cam.autocal){
          cam.busy=`Kamera ${i+1} hat sich bewegt, kalibriere neu …`;if(document.querySelector('.camgrid')) renderCam();
          const r=await camAutoCal(i,{keepRot:true});cam.busy='';
          msgs.push(r.ok?'hat sich bewegt und wurde automatisch neu kalibriert':'hat sich bewegt, automatische Neukalibrierung fehlgeschlagen');
        }else{cam.moved[i]=true;msgs.push('hat sich bewegt, bitte neu kalibrieren');}
      }else{
        if(c.sharp&&st.sharp<c.sharp*0.55) msgs.push('Bild unscharf, bitte Fokus und Linse prüfen');
        if(c.bright&&(br<c.bright*0.65||br>c.bright*1.5)) msgs.push('Licht stark verändert');
      }
      const m=msgs.length?`Kamera ${i+1}: `+msgs.join(', '):'';
      if(m!==cam.health[i]){cam.health[i]=m;changed=true;if(m) cam.last=m;}
    }
  }finally{cam.healing=false;}
  if(changed&&document.querySelector('.camgrid')) renderCam();
}
async function camWake(){
  if(!cam.sleeping) return;
  await camStart();
  if(cam.active){cam.ref=[];cam.prev=[];cam.state='idle';clearInterval(cam.timer);cam.timer=setInterval(camTick,camTickMs());}
}
const camTickMs=()=>(CAM_SPEED[cam.speed]||CAM_SPEED[2])[1];

/* ---------- Geometrie: Homographie Board (mm) ↔ Bild (0 bis 1) ---------- */
/* H bildet Board-Punkte (X rechts, Y oben, in mm/170) auf Bildpunkte ab, h33=1 */
function fitH(pts){
  const rows=[],rhs=[];
  pts.forEach(p=>{const X=p.X/170,Y=p.Y/170;rows.push([X,Y,1,0,0,0,-p.ix*X,-p.ix*Y]);rhs.push(p.ix);rows.push([0,0,0,X,Y,1,-p.iy*X,-p.iy*Y]);rhs.push(p.iy);});
  return lsq(rows,rhs);
}
function projH(H,X,Y){const x=X/170,y=Y/170,w=H[6]*x+H[7]*y+1;return [(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w];}
function invH(H,u,v){
  const a=H[0]-u*H[6],b=H[1]-u*H[7],c=H[3]-v*H[6],d=H[4]-v*H[7],det=a*d-b*c;
  if(Math.abs(det)<1e-12) return null;
  const e=u-H[2],f=v-H[5];return [(e*d-b*f)/det*170,(a*f-e*c)/det*170];
}
/* Schräg blickende Kamera (wie bei Autodarts): Board erscheint als Ellipse, nicht als schmaler Streifen */
function isAngled(H){
  let lo=1,hi=0;for(let k=0;k<36;k++){const a=k*10*Math.PI/180,[,v]=projH(H,170*Math.sin(a),170*Math.cos(a));lo=Math.min(lo,v);hi=Math.max(hi,v);}
  return hi-lo>0.15;
}
function fitCal(pts){
  const rows=pts.map(p=>[p.X,p.Y,1,-p.ix*p.X,-p.ix*p.Y]),p=lsq(rows,pts.map(q=>q.ix));
  const ln=lsq(pts.map(q=>[q.ix,1]),pts.map(q=>q.iy))||[0,0.5];
  const ys=pts.map(q=>q.iy);
  const H=pts.length>=4?fitH(pts):null;
  const err=H?Math.sqrt(pts.reduce((s,q)=>{const [u,v]=projH(H,q.X,q.Y);return s+(u-q.ix)**2+(v-q.iy)**2;},0)/pts.length):null;
  return {p,line:ln,band:[Math.max(0,Math.min(...ys)-0.12),Math.min(1,Math.max(...ys)+0.12)],H,angled:!!(H&&isAngled(H)),err};
}
/* ---------- Automatische Kalibrierung ----------
   Ohne Klicken: 1. rote und grüne Pixel (Double- und Triple-Ring, Bull) suchen, 2. Ellipse an den äußeren
   Farbring legen, 3. Board-Modell (Farben je Segment) über die Homographie bestmöglich einpassen,
   4. die Lage der 20 an den Zahlen erkennen: ein- und zweistellige Zahlen wechseln sich am Rand in einer
   eindeutigen Reihenfolge ab (nur 10/15 und 11/14 stehen zweistellig nebeneinander).
   Arbeitet auf einem RGBA-Bild (ImageData-ähnlich: {width,height,data}). */
const DIGITS=SEGS.map(s=>s>=10?1:0);
function acSamples(){
  const S=[],add=(r,deg,t,w)=>{const a=deg*Math.PI/180;S.push([r*Math.sin(a),r*Math.cos(a),t,w]);};
  for(let k=0;k<20;k++){
    const even=k%2===0;// 20 und jedes zweite Segment: Double/Triple rot, Single schwarz
    for(const o of [-5,0,5]){
      add(166,k*18+o,even?'R':'G',2);add(103,k*18+o,even?'R':'G',2);
      for(const r of [40,70,125,148]) add(r,k*18+o,even?'D':'L',1);
      // direkt neben den Ringen: dort darf keine Farbe sein, das legt die Ringe genau fest
      for(const r of [95,111,158]) add(r,k*18+o,even?'D':'L',1.5);
      add(175,k*18+o,'D',1.5);
    }
  }
  for(let k=0;k<8;k++) add(11,k*45,'G',2);
  add(0,0,'R',2);
  return S;
}
const AC_SAMPLES=acSamples();
function acPix(img,x,y){
  const xi=Math.round(x),yi=Math.round(y);if(xi<0||yi<0||xi>=img.width||yi>=img.height) return null;
  const j=(yi*img.width+xi)*4;return [img.data[j],img.data[j+1],img.data[j+2]];
}
/* Passt das Board-Modell unter H (Board mm → Bildpixel) zum Bild? Höher ist besser, ungefähr −1 bis 1 */
function acScore(img,Hpx){
  let s=0,n=0;
  for(const [X,Y,t,w] of AC_SAMPLES){
    const [u,v]=projH(Hpx,X,Y),p=acPix(img,u,v);n+=w;if(!p){s-=0.1*w;continue;}
    const [r,g,b]=p,br=(r+g+b)/765;
    const red=(r-Math.max(g,b))/255,green=(g-Math.max(r,b*0.85))/255;
    const sat=Math.max(0,red,green);
    s+=w*(t==='R'?red-Math.max(0,green):t==='G'?green-Math.max(0,red):t==='D'?0.45-br-sat:br-0.45-sat);
  }
  return s/n;
}
/* Homographie aus vier Bildpunkten der Board-Punkte oben, rechts, unten, links (je 170 mm) */
const AC_REF=[[0,170],[170,0],[0,-170],[-170,0]];
const acH=Q=>fitH(AC_REF.map(([X,Y],k)=>({X,Y,ix:Q[k][0],iy:Q[k][1]})));
/* Rote (1) und grüne (2), kräftig gesättigte Pixel; der äußerste Bildrand (Rahmen, Raum) zählt nicht */
function acColorMask(img){
  const W=img.width,Hh=img.height,d=img.data,col=new Uint8Array(W*Hh);let n=0;
  const mgx=Math.round(W*0.012)+2,mgy=Math.round(Hh*0.012)+2;
  for(let y=mgy;y<Hh-mgy;y++) for(let x=mgx;x<W-mgx;x++){
    const j=(y*W+x)*4,r=d[j],g=d[j+1],b=d[j+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    if(mx<45||mx-mn<40) continue;
    if(r===mx&&r>g*1.45&&r>b*1.3){col[y*W+x]=1;n++;}else if(g===mx&&g>r*1.25&&g>b*1.05){col[y*W+x]=2;n++;}
  }
  return {col,n,W,H:Hh};
}
/* Zusammenhängende Farbflächen (4er-Nachbarschaft) mit Größe, Schwerpunkt und Rahmen */
function acComponents(M){
  const {col,W,H}=M,lab=new Int32Array(W*H).fill(-1),comps=[],st=[];
  for(let k=0;k<W*H;k++){
    if(!col[k]||lab[k]>=0) continue;
    const c={kind:col[k],n:0,sx:0,sy:0,x0:W,x1:0,y0:H,y1:0};lab[k]=comps.length;st.push(k);
    while(st.length){const q=st.pop(),x=q%W,y=(q/W)|0;c.n++;c.sx+=x;c.sy+=y;if(x<c.x0)c.x0=x;if(x>c.x1)c.x1=x;if(y<c.y0)c.y0=y;if(y>c.y1)c.y1=y;
      for(const nb of [q-1,q+1,q-W,q+W]){if(nb<0||nb>=W*H||lab[nb]>=0||col[nb]!==c.kind) continue;if((nb===q-1||nb===q+1)&&((nb/W)|0)!==y) continue;lab[nb]=comps.length;st.push(nb);}}
    c.cx=c.sx/c.n;c.cy=c.sy/c.n;comps.push(c);
  }
  return comps;
}
/* Zweiter Startweg ohne die ferne Board-Seite: Bull (grüner Ring mit rotem Kern), nächster Board-Punkt
   (weitester Farbpunkt vom Bull) und die seitlich äußersten Farbpunkte. Liefert Bildpunkte für Bull, nah, links, rechts. */
function acExtremes(M){
  const comps=acComponents(M).filter(c=>c.n>=4);
  const big=comps.filter(c=>c.n>=12);if(big.length<4) return null;
  // Bull: grüne Fläche, die in allen Richtungen von Ringteilen umgeben ist (Teile der äußeren Ringe haben
  // nach außen nichts mehr um sich); ein roter Kern darin zählt extra
  const {col,W,H}=M;let bull=null;
  for(const g of comps){
    if(g.kind!==2||g.n<5||g.n>M.n*0.08) continue;
    const sz=Math.max(g.x1-g.x0,g.y1-g.y0,3);let cov=0;
    for(let k=0;k<16;k++){const dx=Math.cos(k*Math.PI/8),dy=Math.sin(k*Math.PI/8);
      for(let t=sz*2;;t++){const x=Math.round(g.cx+dx*t),y=Math.round(g.cy+dy*t);if(x<0||y<0||x>=W||y>=H) break;if(col[y*W+x]){cov++;break;}}}
    const core=comps.some(r=>r.kind===1&&r.cx>g.x0&&r.cx<g.x1&&r.cy>g.y0&&r.cy<g.y1&&r.n<g.n*1.5);
    const sc=cov+(core?3:0);
    if(cov>=13&&(!bull||sc>bull.sc||(sc===bull.sc&&g.n>bull.n))) bull={x:g.cx,y:g.cy,sc,n:g.n};
  }
  if(!bull) return null;
  // nur Flächen, die zu den Ringen gehören: Abstand vom Bull nicht extrem
  const pts=[];big.forEach(c=>{for(let y=c.y0;y<=c.y1;y++) for(let x=c.x0;x<=c.x1;x++) if(M.col[y*M.W+x]) pts.push([x,y,Math.hypot(x-bull.x,y-bull.y)]);});
  const ds=pts.map(p=>p[2]).sort((a,b)=>a-b),lim=ds[(ds.length*0.97)|0]*1.15;
  const ring=pts.filter(p=>p[2]<=lim);if(ring.length<50) return null;
  const near=ring.reduce((a,p)=>p[2]>a[2]?p:a);
  const nx=(near[0]-bull.x)/near[2],ny=(near[1]-bull.y)/near[2],rx=ny,ry=-nx;// "rechts" quer zur Blickrichtung
  const along=p=>(p[0]-bull.x)*rx+(p[1]-bull.y)*ry;
  const right=ring.reduce((a,p)=>along(p)>along(a)?p:a),left=ring.reduce((a,p)=>along(p)<along(a)?p:a);
  return {bull:[bull.x,bull.y],near:[near[0],near[1]],left:[left[0],left[1]],right:[right[0],right[1]]};
}
/* Startwert aus acExtremes: Bull auf (0,0), nah auf 170 mm Richtung psi+180°, links/rechts quer dazu */
function acInitExt(X,psi){
  const pts=[[0,0,X.bull],[0,-170,X.near],[-170,0,X.left],[170,0,X.right]].map(([bx,by,im])=>{const c=Math.cos(psi),s=Math.sin(psi);return {X:bx*c+by*s,Y:-bx*s+by*c,ix:im[0],iy:im[1]};});
  const H=fitH(pts);return H?AC_REF.map(([X0,Y0])=>projH(H,X0,Y0)):null;
}
function acFindEllipse(img){
  const M=acColorMask(img),W=img.width,Hh=img.height,col=M.col,pts=[];
  if(M.n<200) return null;
  // Mittelpunkt robust: Median der Farbpixel
  const xs=[],ys=[];for(let k=0;k<col.length;k++) if(col[k]){xs.push(k%W);ys.push((k/W)|0);}
  xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);let cx=xs[xs.length>>1],cy=ys[ys.length>>1];
  for(let it=0;it<3;it++){
    pts.length=0;
    for(let a=0;a<360;a+=2){
      const dx=Math.cos(a*Math.PI/180),dy=Math.sin(a*Math.PI/180);let far=null;
      for(let t=4;;t++){const x=Math.round(cx+dx*t),y=Math.round(cy+dy*t);if(x<0||y<0||x>=W||y>=Hh) break;if(col[y*W+x]) far=[x,y,t];}
      if(far) pts.push(far);
    }
    if(pts.length<40) return null;
    const rs=pts.map(p=>p[2]).sort((a,b)=>a-b),med=rs[rs.length>>1];
    // Randpunkt muss zu den Nachbarstrahlen passen (gleitender Median über ±15°), Ausreißer wie Logos fallen weg
    const loc=pts.map((p,k)=>{const nb=[];for(let o=-7;o<=7;o++) nb.push(pts[(k+o+pts.length)%pts.length][2]);nb.sort((a,b)=>a-b);return nb[7];});
    let keep=pts.filter((p,k)=>p[2]>med*0.5&&p[2]<med*1.6&&Math.abs(p[2]-loc[k])<=Math.max(4,loc[k]*0.08));
    let E=null;
    for(let rep=0;rep<3&&keep.length>=12;rep++){
      E=fitEllipse(keep);if(!E) return null;
      const res=keep.map(p=>Math.abs(ellRes(E,p[0],p[1])));const sr=res.slice().sort((a,b)=>a-b),lim=Math.max(0.03,sr[(sr.length*0.8)|0]*1.5);
      keep=keep.filter((p,k)=>res[k]<=lim);
    }
    if(!E) return null;
    if(Math.hypot(E.cx-cx,E.cy-cy)<1){cx=E.cx;cy=E.cy;return E;}
    cx=E.cx;cy=E.cy;
  }
  return fitEllipse(pts);
}
/* Kegelschnitt Ax²+Bxy+Cy²+Dx+Ey=1 nach kleinsten Quadraten, dann Mitte, Halbachsen und Winkel */
function fitEllipse(pts){
  const m=pts.reduce((s,p)=>[s[0]+p[0],s[1]+p[1]],[0,0]).map(v=>v/pts.length),sc=100;
  const P=lsq(pts.map(([x,y])=>{x=(x-m[0])/sc;y=(y-m[1])/sc;return [x*x,x*y,y*y,x,y];}),pts.map(()=>1));
  if(!P) return null;
  const [A,B,C,D,E]=P,det=4*A*C-B*B;if(det<=0) return null;
  const x0=(B*E-2*C*D)/det,y0=(B*D-2*A*E)/det,K=1+(A*x0*x0+B*x0*y0+C*y0*y0);
  const tr=A+C,df=Math.sqrt((A-C)**2+B*B),l1=(tr+df)/2,l2=(tr-df)/2;if(l2<=0||K<=0) return null;
  const phi=0.5*Math.atan2(B,A-C);// Richtung der kleinen Achse (größerer Eigenwert l1)
  return {cx:m[0]+x0*sc,cy:m[1]+y0*sc,a:Math.sqrt(K/l2)*sc,b:Math.sqrt(K/l1)*sc,phi:phi+Math.PI/2,P,m,sc};
}
function ellRes(E,x,y){const u=(x-E.m[0])/E.sc,v=(y-E.m[1])/E.sc,[A,B,C,D,F]=E.P;return A*u*u+B*u*v+C*v*v+D*u+F*v-1;}
/* Startwert aus der Ellipse des Board-Rands. Alle Abbildungen, die den Rand-Kreis auf diese Ellipse legen,
   unterscheiden sich nur noch darin, wohin der Bull fällt (Punkt px,py im Einheitskreis, Perspektive) und
   um wie viel das Board gedreht ist (psi). acInit liefert dazu die Bildpunkte von AC_REF (Bild-y nach unten). */
function acInit(E,psi,px=0,py=0){
  const ca=Math.cos(E.phi),sa=Math.sin(E.phi),cp=Math.cos(psi),sp=Math.sin(psi);
  // Kreis-erhaltende Abbildung, die den Mittelpunkt nach (px,py) schiebt (Lorentz-Boost entlang der Richtung)
  const r=Math.hypot(px,py),dx=r?px/r:1,dy=r?py/r:0,bt=Math.atanh(Math.min(r,0.95)),ch=Math.cosh(bt),sh=Math.sinh(bt);
  return AC_REF.map(([X,Y])=>{
    const x=X/170,y=-Y/170,xr=cp*x-sp*y,yr=sp*x+cp*y;
    const s1=xr*dx+yr*dy,s2=-xr*dy+yr*dx,w=sh*s1+ch,t1=(ch*s1+sh)/w,t2=s2/w;
    const xb=t1*dx-t2*dy,yb=t1*dy+t2*dx,u=E.a*xb,v=E.b*yb;
    return [E.cx+ca*u-sa*v,E.cy+sa*u+ca*v];
  });
}
function acRefine(img,Q,steps){
  let H=acH(Q),best=H?acScore(img,H):-9;
  for(const st of steps){
    let improved=true,guard=0;
    while(improved&&guard++<30){
      improved=false;
      for(let k=0;k<4;k++) for(let c=0;c<2;c++) for(const sg of [1,-1]){
        const T=Q.map(q=>q.slice());T[k][c]+=sg*st;const H2=acH(T);if(!H2) continue;const s=acScore(img,H2);
        if(s>best+1e-6){best=s;Q=T;H=H2;improved=true;}
      }
    }
  }
  return {Q,H,score:best};
}
/* Drehung um j·18° um den Bull: Board-Punkt erst drehen, dann abbilden */
function acRotQ(H,deg){
  const a=deg*Math.PI/180;
  return AC_REF.map(([X,Y])=>projH(H,X*Math.cos(a)+Y*Math.sin(a),-X*Math.sin(a)+Y*Math.cos(a)));
}
/* Helligkeit im Zahlenring je Segment, verglichen mit dem Muster ein-/zweistellig */
function acDigitCorr(img,H){
  const w=[],g=[];
  const P=(r,deg)=>{const a=deg*Math.PI/180;return projH(H,r*Math.sin(a),r*Math.cos(a));};
  for(let k=0;k<20;k++){
    let s=0,n=0;
    for(let o=-7;o<=7;o+=1.5) for(const r of [181,186,191,196]){
      const [u,v]=P(r,k*18+o),p=acPix(img,u,v);
      if(p){const mx=Math.max(...p),mn=Math.min(...p);s+=mx>140&&mx-mn<70?1:0;n++;}
    }
    // Gewicht: Fläche des Zahlenfelds im Bild in Pixeln, nahe Zahlen sind groß und zuverlässig
    const [a1,a2]=P(188,k*18-9),[b1,b2]=P(188,k*18+9),[c1,c2]=P(181,k*18),[d1,d2]=P(196,k*18);
    w.push(n>=20?s/n:null);g.push(Math.hypot(a1-b1,a2-b2)*Math.hypot(c1-d1,c2-d2));
  }
  const idx=w.map((v,k)=>v==null?-1:k).filter(k=>k>=0);if(idx.length<10) return {corr:0,w};
  const G=idx.reduce((s,k)=>s+g[k],0)||1,mw=idx.reduce((s,k)=>s+g[k]*w[k],0)/G,md=idx.reduce((s,k)=>s+g[k]*DIGITS[k],0)/G;
  let s=0,a=0,b=0;idx.forEach(k=>{const x=w[k]-mw,y=DIGITS[k]-md;s+=g[k]*x*y;a+=g[k]*x*x;b+=g[k]*y*y;});
  return {corr:a&&b?s/Math.sqrt(a*b):0,w};
}
/* Ganze Erkennung. Gibt H in relativen Bildkoordinaten (0 bis 1) zurück, dazu Güte und Sicherheit der Drehung */
function autoCalibrate(img,full){
  const E=acFindEllipse(img),X=acExtremes(acColorMask(img));
  if(!E&&!X) return {ok:false,why:'Kein Board gefunden. Sind die roten und grünen Ringe gut zu sehen?'};
  // Suche: Lage des Bulls im Einheitskreis (Raster) und Drehung in 3°-Schritten. Die Farben wiederholen sich
  // alle 36°, deshalb genügt 0 bis 33°; welche der zehn Möglichkeiten die 20 ist, klären danach die Zahlen.
  const cand=[];
  if(E) for(let px=-0.8;px<=0.81;px+=0.1) for(let py=-0.8;py<=0.81;py+=0.1){
    if(px*px+py*py>0.7) continue;
    for(let d=0;d<36;d+=3){const Q=acInit(E,d*Math.PI/180,px,py),H=acH(Q);if(H) cand.push({Q,score:acScore(img,H)});}
  }
  // zweiter Startweg über Bull, nächsten Punkt und Seiten, für jede Drehung
  const extC=[];
  if(X) for(let d=0;d<360;d+=3){const Q=acInitExt(X,d*Math.PI/180),H=Q&&acH(Q);if(H) extC.push({Q,score:acScore(img,H)});}
  cand.sort((a,b)=>b.score-a.score);extC.sort((a,b)=>b.score-a.score);
  let best=null;
  for(const c of cand.slice(0,3).concat(extC.slice(0,3))){const r=acRefine(img,c.Q,[4,2,1,0.5]);if(!best||r.score>best.score) best=r;}
  if(!best||best.score<0.12) return {ok:false,why:'Board nur unsicher erkannt. Licht prüfen, Darts aus dem Board nehmen oder von Hand kalibrieren.',score:best&&best.score};
  // Feinarbeit an Ringübergängen und Drähten, in voller Auflösung (Drehung spielt dafür keine Rolle)
  const big=full||img,Hc=hScale(best.H,big.width/img.width,big.height/img.height);
  const ref=edgeRefine(big,Hc),Hg=ref.stats.count>=40&&ref.stats.med<6?ref.H:Hc;
  // Farben wiederholen sich alle 36°: die Zahlen entscheiden, wo die 20 liegt
  const rots=[];for(let j=0;j<10;j++){const Q=acRotQ(Hg,j*36),H=acH(Q);if(H) rots.push({Q,H,...acDigitCorr(big,H)});}
  rots.sort((a,b)=>b.corr-a.corr);
  const top=rots[0],margin=top.corr-(rots[1]?rots[1].corr:0);
  const fin={H:top.H};
  const W=big.width,Hh=big.height,ptsOf=H=>CAL_PTS.map(([,X,Y])=>{const [u,v]=projH(H,X,Y);return {X,Y,ix:u/W,iy:v/Hh};});
  const pts=ptsOf(fin.H);
  // alle zehn möglichen Lagen der 20, die wahrscheinlichste zuerst; ist sie unsicher, klären die ersten Würfe (locate)
  const alts=[pts].concat(rots.slice(1).map(r=>ptsOf(r.H)));
  const st=ref.stats.count>=40?edgeStats(edgeMeasure(ref.E,fin.H),fin.H):null;
  return {ok:true,pts,alts,altCorr:rots.map(r=>r.corr),score:best.score,corr:top.corr,margin,sure:top.corr>0.35&&margin>0.12,
    stats:st,sharp:st?st.sharp:0,bright:boardBright(ref.E,fin.H)};
}

/* ---------- Verfeinerung an Ringübergängen und Drähten, Selbstprüfung ----------
   Mit einer ungefähren Homographie wird entlang von Strahlen in der Board-Ebene gemessen (Polarkoordinaten):
   radial über die sechs Ringübergänge (WDF-Radien), quer über die 20 Segmentdrähte in den Single-Feldern.
   Jede gefundene Kante (subpixelgenau) ergibt ein Punktpaar Bild ↔ Board, daraus wird die Homographie neu
   berechnet. Das wiederholt sich, bis es stabil ist. Hpx bildet Board-mm auf Bildpixel ab (wie acH). */
const RING_R=[6.35,15.9,99,107,162,170];
const WIRE_R=[25,45,65,85,118,135,150];
function edgePrep(img){
  const W=img.width,H=img.height,d=img.data,g=new Float32Array(W*H),s=new Float32Array(W*H);
  for(let k=0,j=0;k<W*H;k++,j+=4){const r=d[j],gg=d[j+1],b=d[j+2];g[k]=0.299*r+0.587*gg+0.114*b;s[k]=Math.max(r,gg,b)-Math.min(r,gg,b);}
  return {W,H,g,s};
}
function bil(a,W,H,x,y){
  if(!(x>=0&&y>=0&&x<W-1&&y<H-1)) return NaN;
  const x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,k=y0*W+x0;
  return a[k]*(1-fx)*(1-fy)+a[k+1]*fx*(1-fy)+a[k+W]*(1-fx)*fy+a[k+W+1]*fx*fy;
}
/* Stärkste Kante (Helligkeit und Sättigung) auf der Strecke P0→P1 in der Board-Ebene: Lage t (0 bis 1) und Stärke */
function edgeAlong(E,Hpx,P0,P1,n){
  const v=[];
  for(let k=0;k<=n;k++){
    const t=k/n,[u,w]=projH(Hpx,P0[0]+(P1[0]-P0[0])*t,P0[1]+(P1[1]-P0[1])*t);
    const a=bil(E.g,E.W,E.H,u,w);if(isNaN(a)) return null;v.push([a,bil(E.s,E.W,E.H,u,w)]);
  }
  const dd=[];let best=-1,bi=-1;
  for(let k=1;k<n;k++){const d=Math.abs(v[k+1][0]-v[k-1][0])+Math.abs(v[k+1][1]-v[k-1][1]);dd.push(d);if(d>best){best=d;bi=k;}}
  if(bi<2||bi>n-2) return null;
  const med=dd.slice().sort((a,b)=>a-b)[dd.length>>1];
  if(best<12||best<med*2.5) return null;
  const y0=dd[bi-2],y1=dd[bi-1],y2=dd[bi],den=y0-2*y1+y2,off=den<0?Math.max(-0.5,Math.min(0.5,0.5*(y0-y2)/den)):0;
  return {t:(bi+off)/n,str:best};
}
const polar=(r,deg)=>{const a=deg*Math.PI/180;return [r*Math.sin(a),r*Math.cos(a)];};
/* Suchfenster je Ringübergang (mm). Grob: weit, aber so, dass kein Nachbar-Übergang hineinfällt; fein: eng */
const RING_WIN={6.35:[2.5,11],15.9:[11,45],99:[60,105.5],107:[100.5,150],162:[125,168],170:[163.5,180]};
/* Alle Kanten messen; liefert Punktpaare {u,w (Bild), X,Y (Board, Soll), kind, R oder deg, str} */
function edgeMeasure(E,Hpx,coarse){
  const C=[];
  for(const R of RING_R){
    const bull=R<20,step=bull?15:3;
    const [r0,r1]=coarse?RING_WIN[R]:[R-(bull?2.8:3.5),R+(bull?2.8:3.5)],n=Math.max(24,Math.round((r1-r0)*4));
    for(let a=bull?0:1.5;a<360;a+=step){
      if(!bull&&Math.abs(((a-9)%18+18)%18-9)>7.5) continue;// nicht genau auf einem Draht messen
      const e=edgeAlong(E,Hpx,polar(r0,a),polar(r1,a),n);if(!e) continue;
      const rm=r0+(r1-r0)*e.t,[u,w]=projH(Hpx,...polar(rm,a)),[X,Y]=polar(R,a);
      C.push({u,w,X,Y,kind:'r',R,str:e.str});
    }
  }
  const ws=coarse?7:2.5;
  for(let k=0;k<20;k++){
    const d0=k*18+9;
    for(const r of WIRE_R){
      const e=edgeAlong(E,Hpx,polar(r,d0-ws),polar(r,d0+ws),Math.round(ws*20));if(!e) continue;
      const dm=d0-ws+2*ws*e.t,[u,w]=projH(Hpx,...polar(r,dm)),[X,Y]=polar(r,d0);
      C.push({u,w,X,Y,kind:'w',deg:d0,str:e.str});
    }
  }
  return C;
}
const hScale=(H,sx,sy)=>[H[0]*sx,H[1]*sx,H[2]*sx,H[3]*sy,H[4]*sy,H[5]*sy,H[6],H[7]];
/* Homographie aus vielen Punktpaaren, robust: Ringe und Drähte getrennt filtern (sonst hielte die Mehrheit der
   Ringpunkte die Drähte bei leicht falscher Drehung für Ausreißer) und gleich stark gewichten. */
function edgeFit(C,W,Hh){
  let use=C,H=null;
  for(let rep=0;rep<3;rep++){
    const nr=use.filter(c=>c.kind==='r').length,nw=use.length-nr;if(nr<12||nw<12) return H;
    const rows=[],rhs=[];
    use.forEach(c=>{const X=c.X/170,Y=c.Y/170,u=c.u/W,v=c.w/Hh,w=Math.sqrt(c.kind==='w'?nr/nw:1);
      rows.push([X,Y,1,0,0,0,-u*X,-u*Y].map(q=>q*w));rhs.push(u*w);rows.push([0,0,0,X,Y,1,-v*X,-v*Y].map(q=>q*w));rhs.push(v*w);});
    const Hn=lsq(rows,rhs);if(!Hn) return H;
    H=hScale(Hn,W,Hh);
    const d=use.map(c=>{const Q=invH(H,c.u,c.w);return Q?Math.hypot(Q[0]-c.X,Q[1]-c.Y):99;});
    const lim={};for(const k of ['r','w']){const dk=d.filter((x,n)=>use[n].kind===k).sort((a,b)=>a-b);lim[k]=Math.max(0.4,(dk[dk.length>>1]||0)*2.5);}
    const nxt=use.filter((c,k)=>d[k]<=lim[c.kind]);if(nxt.length===use.length||nxt.length<30) break;use=nxt;
  }
  return H;
}
/* Kreis durch Punkte (algebraisch): Mittelpunkt */
function circleCenter(P){
  const r=lsq(P.map(([x,y])=>[x,y,1]),P.map(([x,y])=>-(x*x+y*y)));return r?[-r[0]/2,-r[1]/2]:null;
}
/* Selbstprüfung. rel: Reprojektionsfehler in Pixeln (gemessene Kante gegen abgebildeten Sollpunkt), in % des
   Board-Radius im Bild. Radien, Winkel und Zentrum in mm bzw. Grad auf dem Board, als Median (robust gegen
   einzelne Ausreißer, etwa durch einen Dart im Board). med: mittlere Abweichung auf dem Board in mm. */
function edgeStats(C,H){
  const med=a=>a.length?a.slice().sort((x,y)=>x-y)[a.length>>1]:null;
  let str=0;const rings={},ds=[],rad=[],ang=[],px=[];
  C.forEach(c=>{
    const [pu,pv]=projH(H,c.X,c.Y);px.push((pu-c.u)**2+(pv-c.w)**2);str+=c.str;
    const Q=invH(H,c.u,c.w);if(!Q) return;ds.push(Math.hypot(Q[0]-c.X,Q[1]-c.Y));
    if(c.kind==='r'){rad.push(Math.abs(Math.hypot(Q[0],Q[1])-c.R));(rings[c.R]=rings[c.R]||[]).push(Q);}
    else if(Math.hypot(c.X,c.Y)>=118){let a=Math.atan2(Q[0],Q[1])*180/Math.PI;a=((a-c.deg)%360+540)%360-180;ang.push(Math.abs(a));}// Winkel nur außen sinnvoll messbar
  });
  const [cu,cv]=projH(H,0,0);let size=0;for(let a=0;a<360;a+=30){const [u,v]=projH(H,...polar(170,a));size+=Math.hypot(u-cu,v-cv)/12;}
  const cs=Object.values(rings).filter(p=>p.length>=12).map(circleCenter).filter(Boolean);
  // Reprojektionsfehler ohne die schlechtesten 10 % (falsch gegriffene Kanten)
  const keep=px.sort((a,b)=>a-b).slice(0,Math.max(1,Math.ceil(px.length*0.9))),rmsPx=C.length?Math.sqrt(keep.reduce((a,b)=>a+b,0)/keep.length):99;
  return {count:C.length,rmsPx,rel:size?rmsPx/size*100:99,med:med(ds)??99,rad:med(rad),ang:med(ang),
    ctr:cs.length?med(cs.map(c=>Math.hypot(c[0],c[1]))):null,sharp:C.length?str/C.length:0};
}
/* Verfeinern: messen, neu rechnen, bis es stabil ist; Ergebnis mit Selbstprüfung auf frischer Messung */
function edgeRefine(img,Hpx){
  const E=edgePrep(img);let H=Hpx,C=[];
  for(let it=0;it<7;it++){
    C=edgeMeasure(E,H,it<3);if(C.length<40) break;
    const H2=edgeFit(C,img.width,img.height);if(!H2) break;
    const moved=AC_REF.reduce((m,[X,Y])=>{const a=projH(H,X,Y),b=projH(H2,X,Y);return Math.max(m,Math.hypot(a[0]-b[0],a[1]-b[1]));},0);
    H=H2;if(it>=3&&moved<0.05) break;
  }
  C=edgeMeasure(E,H);
  return {H,stats:edgeStats(C,H),E};
}
/* Mittlere Helligkeit im Board (für die Lichtprüfung) */
function boardBright(E,H){
  let s=0,n=0;for(let r=30;r<=160;r+=26) for(let a=0;a<360;a+=20){const [u,w]=projH(H,...polar(r,a)),v=bil(E.g,E.W,E.H,u,w);if(!isNaN(v)){s+=v;n++;}}
  return n?s/n:0;
}
const statText=st=>st?`Genauigkeit ${st.rel.toFixed(2).replace('.',',')} %`+(st.rad!=null?`, Radien ${st.rad.toFixed(2).replace('.',',')} mm`:'')+(st.ang!=null?`, Winkel ${st.ang.toFixed(2).replace('.',',')}°`:'')+(st.ctr!=null?`, Zentrum ${st.ctr.toFixed(2).replace('.',',')} mm`:''):'';

/* Kalibrierung gilt nur fürs selbe Seitenverhältnis (Punkte sind relativ zur Bildgröße gespeichert) */
const calOf=i=>{const id=cam.slots[i];const c=id&&cam.cal[id];if(!c||!c.p) return null;const ar=camAR(i);if(ar&&Math.abs(ar-(c.ar||4/3))>0.05) return null;return c;};
const calStale=i=>{const id=cam.slots[i];const c=id&&cam.cal[id];const ar=camAR(i);return !!(c&&c.p&&ar&&Math.abs(ar-(c.ar||4/3))>0.05);};
/* Suchbereich je Kamera: schräg die Board-Ellipse samt Surround und etwas Rand (300 mm, damit auch Darts
   ganz außen mit Schaft und Flight im Bereich liegen), flach das Band um die Oberfläche */
function maskOf(i){
  const c=calOf(i);if(!c) return null;
  const key=(cam.slots[i]||'')+':'+CW+'x'+CH+':'+cam.margin+':'+(c.pts||[]).map(q=>q.ix.toFixed(4)).join(',');
  const m=cam.masks[i];if(m&&m.key===key) return m;
  const a=new Uint8Array(CW*CH);let n=0,y0=CH,y1=0;
  if(c.angled&&c.H){
    for(let y=0;y<CH;y++) for(let x=0;x<CW;x++){const P=invH(c.H,(x+0.5)/CW,(y+0.5)/CH);if(P&&Math.hypot(P[0],P[1])<=300){a[y*CW+x]=1;n++;if(y<y0)y0=y;if(y>y1)y1=y;}}
  }else{
    const ys=(c.pts||[]).map(q=>q.iy);
    y0=Math.max(0,Math.floor((Math.min(...ys)-cam.margin)*CH));y1=Math.min(CH-1,Math.ceil((Math.max(...ys)+cam.margin)*CH));
    for(let y=y0;y<=y1;y++) for(let x=0;x<CW;x++){a[y*CW+x]=1;n++;}
  }
  return cam.masks[i]={key,a,n:Math.max(1,n),y0:Math.min(y0,y1),y1};
}
function gray(i){
  const v=cam.videos[i];if(!v||v.readyState<2) return null;
  wctx.drawImage(v,0,0,CW,CH);
  const d=wctx.getImageData(0,0,CW,CH).data,g=new Uint8Array(CW*CH);
  for(let k=0,j=0;k<g.length;k++,j+=4) g[k]=(d[j]*77+d[j+1]*151+d[j+2]*28)>>8;
  return g;
}
/* Veränderte Pixel im Suchbereich: Anzahl (für Darts, unabhängig von der Größe des Suchbereichs) und Anteil (für die Hand) */
function diffCount(f,r,m){
  let n=0;
  for(let y=m.y0;y<=m.y1;y++){const o=y*CW;for(let x=0;x<CW;x++){const k=o+x;if(m.a[k]&&Math.abs(f[k]-r[k])>cam.thr) n++;}}
  return {n,frac:n/m.n};
}
/* Dartspitze: schräg der unterste zusammenhängende Teil der Veränderung (der Dart ragt im Bild nach oben),
   flach die veränderten Pixel nächst der Oberflächenlinie. Ergebnis relativ zur Bildgröße. */
function findTip(f,r,c,m){
  if(c.angled){
    const rows=new Array(CH).fill(0);
    for(let y=m.y0;y<=m.y1;y++){const o=y*CW;for(let x=0;x<CW;x++){const k=o+x;if(m.a[k]&&Math.abs(f[k]-r[k])>cam.thr) rows[y]++;}}
    for(let y=m.y1;y>=m.y0+2;y--){
      if(rows[y]+rows[y-1]+rows[y-2]<5) continue;
      let sx=0,sy=0,n=0;
      for(let yy=y;yy>=Math.max(m.y0,y-4);yy--){const o=yy*CW;for(let x=0;x<CW;x++){const k=o+x;if(m.a[k]&&Math.abs(f[k]-r[k])>cam.thr){sx+=x;sy+=yy;n++;}}}
      return n?{x:(sx/n+0.5)/CW,y:(sy/n+0.5)/CH}:null;
    }
    return null;
  }
  const px=[];
  for(let y=m.y0;y<=m.y1;y++){const o=y*CW;for(let x=0;x<CW;x++) if(Math.abs(f[o+x]-r[o+x])>cam.thr){const nx=x/CW,ny=y/CH;px.push([nx,Math.abs(ny-(c.line[0]*nx+c.line[1])),ny]);}}
  if(px.length<8) return null;
  px.sort((a,b)=>a[1]-b[1]);
  const top=px.slice(0,12);
  return {x:top.reduce((s,p)=>s+p[0],0)/top.length,y:top.reduce((s,p)=>s+p[2],0)/top.length};
}
function solve(A,b){
  const n=b.length,M=A.map((r,i)=>r.concat([b[i]]));
  for(let i=0;i<n;i++){
    let p=i;for(let k=i+1;k<n;k++) if(Math.abs(M[k][i])>Math.abs(M[p][i])) p=k;
    [M[i],M[p]]=[M[p],M[i]];
    if(Math.abs(M[i][i])<1e-12) return null;
    for(let k=0;k<n;k++){if(k===i) continue;const f=M[k][i]/M[i][i];for(let j=i;j<=n;j++) M[k][j]-=f*M[i][j];}
  }
  return M.map((r,i)=>r[n]/r[i]);
}
function lsq(rows,rhs){
  const n=rows[0].length,A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
  rows.forEach((r,k)=>{for(let i=0;i<n;i++){b[i]+=r[i]*rhs[k];for(let j=0;j<n;j++) A[i][j]+=r[i]*r[j];}});
  return solve(A,b);
}
function triangulate(lines){
  if(lines.length<2) return null;
  const P=lsq(lines.map(l=>[l[0],l[1]]),lines.map(l=>l[2]));
  if(!P||!isFinite(P[0])||!isFinite(P[1])||Math.hypot(P[0],P[1])>260) return null;
  return P;
}
/* Aus den Spitzen aller Kameras einen Board-Punkt bestimmen: je Kamera liefert die x-Position eine Gerade
   auf dem Board (gilt für flache und schräge Kameras), mehrere Geraden ergeben den Schnittpunkt.
   Sieht nur eine schräge Kamera den Dart, reicht ihre Homographie allein. */
const lineOf=(c,t)=>{const [a1,a2,a3,c1,c2]=c.p;return [a1-t.x*c1,a2-t.x*c2,t.x-a3];};
const lineDist=(l,P)=>Math.abs(l[0]*P[0]+l[1]*P[1]-l[2])/(Math.hypot(l[0],l[1])||1);
/* Kandidaten je Kamera: von Hand oder durch Würfe bestätigt nur eine, sonst alle zehn Drehungen */
const altCache=new WeakMap();
function candOf(c){
  if(!Array.isArray(c.alts)||c.alts.length<2) return [c];
  if(!altCache.has(c)) altCache.set(c,c.alts.map(pts=>Object.assign({},c,fitCal(pts),{pts})));
  return altCache.get(c);
}
let lastChoice=null;
function locateOne(tips){
  const P=triangulate(tips.map(({c,t})=>lineOf(c,t)));if(P) return P;
  const one=tips.find(({c})=>c.angled&&c.H);
  if(one){const Q=invH(one.c.H,one.t.x,one.t.y);if(Q&&Math.hypot(Q[0],Q[1])<=260) return Q;}
  return null;
}
/* Lage der 20 für unsichere Kameras über mehrere Würfe klären: Für jede Kombination der Drehungen wird
   aufsummiert, wie schlecht sich die Geraden aller Kameras in einem Punkt treffen (mm²). Die richtige
   Kombination bleibt bei jedem Wurf nahe null. Die Zahlenerkennung gibt ein leichtes Vorwissen. */
const rotAcc={key:'',sums:new Map(),n:0};
function locate(tips){
  lastChoice=null;
  const opts=tips.map(({c})=>candOf(c));
  if(opts.every(o=>o.length===1)) return locateOne(tips);
  const sure=tips.filter((tp,i)=>opts[i].length===1);
  if(tips.length<3) return sure.length?locateOne(sure):locateOne(tips);
  const key=tips.map(({c},i)=>opts[i].length>1?(c.pts[0].ix.toFixed(4)):'s').join('|');
  if(rotAcc.key!==key){rotAcc.key=key;rotAcc.sums=new Map();rotAcc.n=0;}
  const prior=ch=>tips.reduce((s,{c},i)=>s+(opts[i].length>1&&c.altCorr?25*Math.max(0,c.altCorr[0]-c.altCorr[ch[i]]):0),0);
  let best=null;const now=[];
  const rec=(k,ch)=>{
    if(k===tips.length){
      const ls=tips.map((tp,i)=>lineOf(opts[i][ch[i]],tp.t)),P=triangulate(ls);
      const r2=P?ls.reduce((s,l)=>s+lineDist(l,P)**2,0)/ls.length:400;
      const id=ch.join(','),tot=(rotAcc.sums.get(id)||0)+Math.min(r2,400);now.push([id,tot]);
      const cost=tot+prior(ch);if(P&&(!best||cost<best.cost)) best={P,cost,ch:ch.slice(),id};return;}
    for(let j=0;j<opts[k].length;j++){ch[k]=j;rec(k+1,ch);}
  };
  rec(0,[]);
  // Würfe nah am Bull sagen über die Drehung nichts, sie zählen gleich für alle Kombinationen
  now.forEach(([id,tot])=>rotAcc.sums.set(id,tot));rotAcc.n++;
  if(!best) return sure.length?locateOne(sure):null;
  // Dreht man alle Kameras um dieselben 36°, treffen sich die Geraden genauso gut (Zwillinge): Würfe klären nur
  // die Drehung der Kameras zueinander. Unter den Zwillingen entscheidet die Zahlenerkennung aller Kameras (prior).
  const tots=[...rotAcc.sums.values()].sort((a,b)=>a-b),b0=tots[0],tw=b0+Math.max(2,0.5*rotAcc.n);
  const other=tots.find(t=>t>tw);
  // wie klar entscheidet die Zahlenerkennung zwischen den Zwillingen?
  const twinPri=[...rotAcc.sums.entries()].filter(([,t])=>t<=tw).map(([id])=>prior(id.split(',').map(Number))).sort((a,b)=>a-b);
  lastChoice={tips,ch:best.ch,n:rotAcc.n,best:b0,second:other==null?Infinity:other,twinMargin:twinPri.length>1?twinPri[1]-twinPri[0]:Infinity};
  return best.P;
}
/* Ist die Lage der 20 noch nicht bestätigt (offen oder nur knapp aus den Zahlen)? */
const rotPending=()=>[0,1,2].some(i=>{const c=calOf(i);return c&&(Array.isArray(c.alts)||c.globUnsure);});
/* Alle Kameras gemeinsam um 36° weiterdrehen (zwei Segmente): Notkorrektur, wenn die 20 im Raster falsch liegt */
function rotateAll(deg){
  const a=deg*Math.PI/180;
  [0,1,2].forEach(i=>{const c=calOf(i);if(!c||!c.H) return;
    const pts=CAL_PTS.map(([,X,Y])=>{const [u,v]=projH(c.H,X*Math.cos(a)+Y*Math.sin(a),-X*Math.sin(a)+Y*Math.cos(a));return {X,Y,ix:u,iy:v};});
    Object.assign(c,fitCal(pts),{pts,unsure:false,globUnsure:true});delete c.alts;delete c.altCorr;});
  rotAcc.key='';cam.masks=[];store.set('dart.camcal',cam.cal);
}
function confirmRotation(){[0,1,2].forEach(i=>{const c=calOf(i);if(c){delete c.globUnsure;delete c.alts;delete c.altCorr;c.unsure=false;}});store.set('dart.camcal',cam.cal);}
/* Nach mindestens drei Würfen mit klarem Vorsprung wird die Lage übernommen */
function voteRotation(){
  const L=lastChoice;
  if(!L||L.n<3||!(L.second>Math.max(4*L.best,40*L.n/3))) return '';
  let done=false;
  L.tips.forEach(({c},i)=>{
    if(!Array.isArray(c.alts)) return;
    const wasUnsure=c.unsure||L.ch[i]!==0;
    const j=L.ch[i],pts=c.alts[j];
    // Gemeinsame Drehung nur aus den Zahlen: bei knappem Vorsprung zur Prüfung vormerken
    Object.assign(c,fitCal(pts),{pts,unsure:false,globUnsure:L.twinMargin<4});delete c.alts;delete c.altCorr;if(wasUnsure) done=true;
  });
  rotAcc.key='';cam.masks=[];store.set('dart.camcal',cam.cal);
  return done?'Lage der 20 durch die Würfe geklärt':'';
}
const camAllowed=()=>!!game&&!game.winner&&!isBotTurn()&&canAct();
function camTick(){
  const ids=[0,1,2].filter(i=>calOf(i));
  const frames=[0,1,2].map(i=>ids.includes(i)?gray(i):null);
  const live=frames.filter(Boolean).length;
  if(live<2&&!(live===1&&calOf(frames.findIndex(Boolean)).angled)) return;
  // Schwelle in Pixeln der Rechenauflösung (480 breit): passt sich dem Bildrauschen in Ruhe an (cam.noise),
  // damit auch kleine, weit entfernte Darts zählen, Flimmern aber nicht
  const sc=CW*CH/129600,TH=Math.max([60,35,20][cam.sens]*sc,(cam.noise||0)*4+8*sc),HAND=0.12;
  let mxR=0,mxM=0,mxF=0;
  frames.forEach((f,i)=>{
    if(!f) return;const m=maskOf(i);
    if(!cam.ref[i]||cam.ref[i].length!==f.length) cam.ref[i]=f;
    const d=diffCount(f,cam.ref[i],m);mxR=Math.max(mxR,d.n);mxF=Math.max(mxF,d.frac);
    if(cam.prev[i]&&cam.prev[i].length===f.length) mxM=Math.max(mxM,diffCount(f,cam.prev[i],m).n);
    cam.prev[i]=f;
  });
  if(cam.state==='idle'){
    if(mxR<=TH) cam.noise=(cam.noise||0)*0.95+mxR*0.05;
    if(mxR>TH){cam.state='moving';cam.still=0;camTouch();}
    else if(++cam.idle>40){cam.idle=0;frames.forEach((f,i)=>{if(f) cam.ref[i]=f;});}
    return;
  }
  cam.still=mxM<TH*0.5?cam.still+1:0;
  if(cam.still<4) return;
  const resetRef=()=>frames.forEach((f,i)=>{if(f) cam.ref[i]=f;});
  if(mxF>HAND){
    // Darts ziehen beendet die Aufnahme wie bei Autodarts, sobald mindestens ein Dart gezählt ist.
    // Nicht erkannte Darts zählen dabei als daneben (nextVisit füllt auf), die Meldung sagt das an.
    resetRef();
    if(game&&(game.locked||game.legDone||game.visit.length)&&camAllowed()){
      const miss=game.locked||game.legDone?0:3-game.visit.length;
      nextVisit(false);
      cam.last=miss?`Darts gezogen, ${miss===1?'1 Dart wurde':miss+' Darts wurden'} nicht erkannt und zählen als daneben. Falls nötig: „Rückgängig“.`:'Darts gezogen, nächster Spieler';
      cam.pulledAt=Date.now();
    }else if(!(Date.now()-(cam.pulledAt||0)<5000)) cam.last='Darts gezogen';  // Hand geht wieder weg: Hinweis stehen lassen
  }else if(mxR>TH){
    const tips=[];
    frames.forEach((f,i)=>{if(!f) return;const c=calOf(i),t=findTip(f,cam.ref[i],c,maskOf(i));if(t) tips.push({c,t});});
    const P=locate(tips);
    if(P){
      cam.lastP=P;drawMiniBoard();
      const d=classify(P[0],-P[1]),note=voteRotation();
      cam.last='Erkannt: '+(d.mult?label(d):'daneben')+(note?', '+note:'')+(rotPending()?' (bitte prüfen, Lage der 20 noch nicht bestätigt)':'');
      if(camAllowed()) throwDart(d);
    }else cam.last='Dart nicht eindeutig erkannt, bitte per Taste eingeben';
    resetRef();
  }else resetRef();
  cam.state='idle';
  const el=document.getElementById('camstat');if(el){el.hidden=false;el.textContent=cam.last;}
}
function camToggle(){
  if(cam.active){cam.active=false;clearInterval(cam.timer);cam.timer=null;cam.last='Erkennung gestoppt';return;}
  const ok=[0,1,2].filter(i=>calOf(i)&&cam.videos[i]);
  if(ok.length<2&&!(ok.length===1&&calOf(ok[0]).angled)){cam.last='Für die Erkennung braucht es mindestens 2 laufende, kalibrierte Kameras.';return;}
  cam.active=true;cam.ref=[];cam.prev=[];cam.state='idle';cam.last='Erkennung aktiv, Board ruhig halten';camTouch();
  cam.timer=setInterval(camTick,camTickMs());
}
/* Board-Raster wie bei Autodarts über das Kamerabild legen: Ringe und Segmentgrenzen über die Homographie */
function drawOverlay(x,H,w,h,color){
  if(!H) return;
  x.save();x.strokeStyle=color||'rgba(47,224,192,.95)';x.lineWidth=Math.max(1,w/400);
  const pt=(r,a)=>{const [u,v]=projH(H,r*Math.sin(a),r*Math.cos(a));return [u*w,v*h];};
  [170,162,107,99,15.9,6.35].forEach(r=>{x.beginPath();for(let k=0;k<=72;k++){const [px,py]=pt(r,k*5*Math.PI/180);k?x.lineTo(px,py):x.moveTo(px,py);}x.stroke();});
  for(let k=0;k<20;k++){const a=(k*18+9)*Math.PI/180,[ax,ay]=pt(15.9,a),[bx,by]=pt(170,a);x.beginPath();x.moveTo(ax,ay);x.lineTo(bx,by);x.stroke();}
  // die 20 groß und mit Kontur, damit man sofort sieht, ob die Lage stimmt
  const [tx,ty]=pt(190,0);x.font=`bold ${Math.max(14,w/22)}px sans-serif`;x.textAlign='center';x.textBaseline='middle';
  x.lineWidth=Math.max(3,w/160);x.strokeStyle='rgba(0,0,0,.8)';x.strokeText('20',tx,ty);x.fillStyle=color||'rgba(47,224,192,1)';x.fillText('20',tx,ty);
  x.restore();
}
function camPreview(){
  clearInterval(cam.pv);
  cam.pv=setInterval(()=>{
    let any=false;
    for(let i=0;i<3;i++){
      const cv=document.getElementById('camprev'+i),v=cam.videos[i];
      if(!cv) continue;any=true;
      const fe=document.getElementById('camfps'+i);
      if(fe){const st=cam.streams[i]&&cam.streams[i].getVideoTracks()[0];const s=st&&st.getSettings?st.getSettings():{};fe.textContent=v?`${s.width||v.videoWidth}×${s.height||v.videoHeight}, ${cam.meas[i]} Bilder/s`:'';}
      if(!v||v.readyState<2) continue;
      if(cv.width!==CW||cv.height!==CH){cv.width=CW;cv.height=CH;}
      const x=cv.getContext('2d');x.drawImage(v,0,0,CW,CH);
      const c=calOf(i);if(!c) continue;
      const m=maskOf(i);
      if(cam.diag){
        const f=gray(i);if(!f) continue;
        if(!cam.ref[i]||cam.ref[i].length!==f.length) cam.ref[i]=f;
        const r=cam.ref[i],img=x.getImageData(0,0,CW,CH),dd=img.data;let n=0;
        for(let y=m.y0;y<=m.y1;y++){const o=y*CW;for(let q=0;q<CW;q++){const k=o+q;if(m.a[k]&&Math.abs(f[k]-r[k])>cam.thr){n++;const j=k*4;dd[j]=255;dd[j+1]=40;dd[j+2]=40;}}}
        x.putImageData(img,0,0);
        const tip=findTip(f,r,c,m);
        if(tip){x.fillStyle='#F4D23C';x.strokeStyle='#1F201D';x.lineWidth=2;x.beginPath();x.arc(tip.x*CW,tip.y*CH,5,0,7);x.fill();x.stroke();}
        const el=document.getElementById('camdiag'+i);
        if(el) el.textContent=`Veränderung ${(n/m.n*100).toFixed(1).replace('.',',')} %${tip?', Spitze gefunden':''}`;
      }
      if(c.angled) drawOverlay(x,c.H,CW,CH);
      else{x.strokeStyle='rgba(244,210,60,.9)';x.lineWidth=1;x.strokeRect(0.5,m.y0+0.5,CW-1,m.y1-m.y0);
        x.strokeStyle='rgba(60,210,120,.95)';x.lineWidth=1.5;x.beginPath();x.moveTo(0,c.line[1]*CH);x.lineTo(CW,(c.line[0]+c.line[1])*CH);x.stroke();}
    }
    if(!any){clearInterval(cam.pv);cam.pv=null;}
  },200);
}
function drawMiniBoard(){
  const cv=document.getElementById('camboard');if(!cv) return;
  const x=cv.getContext('2d'),W=cv.width,c=W/2,sc=(W/2-6)/170;
  x.clearRect(0,0,W,W);
  x.fillStyle='#1F201D';x.beginPath();x.arc(c,c,170*sc+4,0,7);x.fill();
  x.strokeStyle='#A39C8A';x.lineWidth=1;
  [170,162,107,99,15.9,6.35].forEach(r=>{x.beginPath();x.arc(c,c,r*sc,0,7);x.stroke();});
  for(let k=0;k<20;k++){const a=(k*18-9-90)*Math.PI/180;x.beginPath();x.moveTo(c+15.9*sc*Math.cos(a),c+15.9*sc*Math.sin(a));x.lineTo(c+170*sc*Math.cos(a),c+170*sc*Math.sin(a));x.stroke();}
  x.fillStyle='#EAE4D3';x.font='600 9px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('20',c,5);
  if(cam.lastP){const [X,Y]=cam.lastP;x.fillStyle='#F4D23C';x.strokeStyle='#1F201D';x.lineWidth=2;x.beginPath();x.arc(c+X*sc,c-Y*sc,5,0,7);x.fill();x.stroke();}
}
/* Kleines Graustufenbild zum Erkennen verrutschter Kameras (Kalibrierung beim Start prüfen) */
function thumbOf(i){
  const v=cam.videos[i];if(!v||v.readyState<2) return null;
  const w=64,h=Math.round(64*v.videoHeight/v.videoWidth),c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(v,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data,g=[];for(let j=0;j<d.length;j+=4) g.push((d[j]*77+d[j+1]*151+d[j+2]*28)>>8);
  return g;
}
/* Normierte Kreuzkorrelation: 1 = gleiches Bild, unempfindlich gegen gleichmäßig andere Helligkeit */
function ncc(a,b){
  if(!a||!b||a.length!==b.length) return 1;
  const n=a.length,ma=a.reduce((s,v)=>s+v,0)/n,mb=b.reduce((s,v)=>s+v,0)/n;let s=0,sa=0,sb=0;
  for(let k=0;k<n;k++){const x=a[k]-ma,y=b[k]-mb;s+=x*y;sa+=x*x;sb+=y*y;}
  return sa&&sb?s/Math.sqrt(sa*sb):1;
}
function checkMoved(){
  let changed=false;
  for(let i=0;i<3;i++){const c=calOf(i),m=!!(c&&c.thumb&&ncc(thumbOf(i),c.thumb)<0.8);if(m!==cam.moved[i]){cam.moved[i]=m;changed=true;}}
  if(changed&&document.getElementById('camprev0')) renderCam();
}
function drawCal(){
  const cv=document.getElementById('calcv');if(!cv||!cam.calImg) return;
  const x=cv.getContext('2d');x.drawImage(cam.calImg,0,0,cv.width,cv.height);
  if(cam.calFit) drawOverlay(x,cam.calFit.H,cv.width,cv.height);
  cam.calPts.forEach((p,k)=>{x.fillStyle='#F4D23C';x.strokeStyle='#1F201D';x.lineWidth=2;x.beginPath();x.arc(p.ix*cv.width,p.iy*cv.height,9,0,7);x.fill();x.stroke();x.fillStyle='#1F201D';x.font='bold 12px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(String(k+1),p.ix*cv.width,p.iy*cv.height);});
}
function calSnap(){
  const v=cam.videos[cam.calSlot];if(!v||v.readyState<2) return;
  const w=960,h=Math.round(960*v.videoHeight/v.videoWidth),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(v,0,0,w,h);cam.calImg=c;
}
function calClick(e){
  const cv=e.target,r=cv.getBoundingClientRect(),k=cam.calPts.length;
  if(k>=CAL_PTS.length) return;
  cam.calPts.push({ix:(e.clientX-r.left)/r.width,iy:(e.clientY-r.top)/r.height,X:CAL_PTS[k][1],Y:CAL_PTS[k][2]});
  if(cam.calPts.length===CAL_PTS.length){
    let fit=fitCal(cam.calPts);
    if(fit.p&&fit.H&&cam.calImg){
      const cv=cam.calImg,img=cv.getContext('2d').getImageData(0,0,cv.width,cv.height),ref=edgeRefine(img,hScale(fit.H,cv.width,cv.height));
      if(ref.stats.count>=40&&ref.stats.rel<CAL_MAX){const pts=CAL_PTS.map(([,X,Y])=>{const [u,v]=projH(ref.H,X,Y);return {X,Y,ix:u/cv.width,iy:v/cv.height};});const f2=fitCal(pts);if(f2.p&&f2.H) fit=Object.assign(f2,{refPts:pts,stats:ref.stats,stats0:ref.stats,sharp:ref.stats.sharp,bright:boardBright(ref.E,ref.H)});}
    }
    if(fit.p&&fit.H) cam.calFit=fit;
    else{cam.err='Die Kalibrierung ging nicht auf. Bitte die Punkte genauer setzen.';cam.calPts=[];}
  }
  renderCam();
}
/* Standbild in 640 Pixel Breite für die automatische Kalibrierung */
function frameImage(i,width=640){
  const v=cam.videos[i];if(!v||v.readyState<2||!v.videoWidth) return null;
  const w=width||v.videoWidth,h=Math.round(w*v.videoHeight/v.videoWidth),c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(v,0,0,w,h);return x.getImageData(0,0,w,h);
}
/* Automatisch kalibrieren mit Selbstprüfung: bis zu drei Versuche mit frischen Bildern, angenommen wird
   unter 0,5 % Reprojektionsfehler (präzise), notfalls unter 2 % mit Hinweis. keepRot: Kamera hat sich nur
   bewegt, die bestätigte Lage der 20 bleibt (nächstliegende Drehung). */
const CAL_OK=0.5,CAL_MAX=2;
async function camAutoCal(i,opt={}){
  let best=null;
  for(let a=0;a<3;a++){
    const img=frameImage(i,640),full=frameImage(i,0);if(!img) return {ok:false,why:'Kein Kamerabild.'};
    const r=autoCalibrate(img,full);
    if(r.ok&&(!best||!best.stats||(r.stats&&r.stats.rel<best.stats.rel))) best=r;
    if(!best&&!r.ok&&a===2) return r;
    if(best&&best.stats&&best.stats.rel<CAL_OK) break;
    await new Promise(res=>setTimeout(res,150));
  }
  if(!best) return {ok:false,why:'Kein Board gefunden.'};
  if(!best.stats||best.stats.rel>=CAL_MAX) return {ok:false,why:`Kalibrierung zu ungenau${best.stats?' ('+best.stats.rel.toFixed(1).replace('.',',')+' %)':''}. Licht prüfen, Darts aus dem Board nehmen oder von Hand kalibrieren.`};
  const prev=cam.cal[cam.slots[i]];let pts=best.pts,extra={unsure:!best.sure,alts:best.alts,altCorr:best.altCorr};
  if(opt.keepRot&&prev&&prev.pts){
    const p20=prev.pts[1];let j=0,dm=Infinity;best.alts.forEach((a,k)=>{const d=Math.hypot(a[1].ix-p20.ix,a[1].iy-p20.iy);if(d<dm){dm=d;j=k;}});
    pts=best.alts[j];
    // war die Lage noch offen, bleiben die Kandidaten erhalten, die gewählte zuerst
    extra=prev.alts?{unsure:prev.unsure,alts:[best.alts[j]].concat(best.alts.filter((a,k)=>k!==j)),altCorr:[best.altCorr[j]].concat(best.altCorr.filter((a,k)=>k!==j))}:{unsure:false};
  }
  const fit=fitCal(pts);if(!fit.p||!fit.H) return {ok:false,why:'Die Kalibrierung ging nicht auf.'};
  const v=cam.videos[i];
  cam.cal[cam.slots[i]]=Object.assign({pts,ar:v.videoWidth/v.videoHeight,thumb:thumbOf(i),auto:true,stats:best.stats,stats0:best.stats,sharp:best.sharp,bright:best.bright},extra,fit);
  store.set('dart.camcal',cam.cal);cam.masks=[];cam.moved[i]=false;cam.ref=[];cam.prev=[];cam.health[i]='';
  return best;
}
/* Alle Kameras nacheinander; onlyNeeded: nur nicht kalibrierte oder verrutschte */
async function camAutoAll(onlyNeeded){
  const todo=[0,1,2].filter(i=>cam.videos[i]&&(!onlyNeeded||!calOf(i)||cam.moved[i]));
  if(!todo.length) return;
  const msg=[];
  for(const i of todo){
    cam.busy=`Kalibriere Kamera ${i+1} …`;if(document.getElementById('camprev0')) renderCam();
    await new Promise(r=>setTimeout(r,30));
    const r=await camAutoCal(i,{keepRot:onlyNeeded&&!!cam.cal[cam.slots[i]]});
    msg.push(r.ok?`Kamera ${i+1} kalibriert, ${r.stats.rel.toFixed(2).replace('.',',')} %${r.stats.rel<CAL_OK?'':' (knapp)'}`:`Kamera ${i+1}: ${r.why}`);
  }
  const cal=[0,1,2].map(calOf).filter(Boolean);
  if(cal.length&&cal.length<3){
    // zwei Geraden schneiden sich immer: die Lage der 20 lässt sich nur aus den Zahlen bestimmen
    cal.forEach(c=>{if(Array.isArray(c.alts)){c.globUnsure=true;delete c.alts;delete c.altCorr;}});store.set('dart.camcal',cam.cal);
    msg.push('Mit weniger als drei Kameras lässt sich die Lage der 20 nicht per Wurf prüfen, bitte am Raster kontrollieren');
  }
  cam.busy='';cam.last=msg.join('. ');
  if(document.getElementById('camprev0')||document.querySelector('.camgrid')) renderCam();
}
/* Rohbilder aller Kameras als PNG herunterladen, etwa um sie für die Fehlersuche weiterzugeben */
async function camSaveImages(){
  const day=new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');let n=0;
  for(let i=0;i<3;i++){
    const v=cam.videos[i];if(!v||v.readyState<2) continue;
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob) continue;
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pfeilerl-kamera${i+1}-${day}.png`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);n++;
    await new Promise(r=>setTimeout(r,400));
  }
  cam.last=n?`${n} Kamerabilder gespeichert (Download-Ordner)`:'Keine Kamerabilder verfügbar';
}
function calSave(){
  const i=cam.calSlot,fit=cam.calFit;if(i<0||!fit) return;
  cam.cal[cam.slots[i]]=Object.assign({pts:fit.refPts||cam.calPts,ar:cam.calImg.width/cam.calImg.height,thumb:thumbOf(i)},fit);delete cam.cal[cam.slots[i]].refPts;cam.health[i]='';
  store.set('dart.camcal',cam.cal);cam.masks=[];cam.moved[i]=false;cam.ref=[];cam.prev=[];
  cam.last=`Kamera ${i+1} kalibriert`;cam.calSlot=-1;cam.calPts=[];cam.calFit=null;
}
function renderCam(){
  if(cam.sleeping) camWake().then(()=>{if(document.getElementById('camprev0')||!cam.devices.length) renderCam();});
  camTouch();
  const hdr='<header class="gbar"><h1 class="gmode">Kamera</h1><button class="ghost" data-act="back">Zurück</button></header>';
  const segBtns=(attr,list,cur,lab)=>`<div class="seg" role="group" aria-label="${lab}">${list.map(([val,txt],k)=>`<button ${attr}="${k}" class="${cur===val?'on':''}" aria-pressed="${cur===val}">${txt}</button>`).join('')}</div>`;
  if(cam.calSlot>=0){
    const k=cam.calPts.length,fit=cam.calFit;
    const q=fit&&fit.err!=null?fit.err*100:null;
    app.innerHTML=`<div class="wrap camwide">${hdr}
    ${fit?`<p>Kamera ${cam.calSlot+1}: Passt das grüne Raster auf Ringe und Segmente der Scheibe? ${fit.stats?`<span class="${fit.stats.rel<CAL_OK?'okc':'warnt'}">An den Drähten nachjustiert: ${statText(fit.stats)}</span>`:`<span class="${q<1?'okc':'warnt'}">Abweichung ${q.toFixed(1).replace('.',',')} %${q<1?', gut':', bitte Punkte genauer setzen'}</span>`}</p>`:
      `<p>Kamera ${cam.calSlot+1}: Tippe auf <b>${CAL_PTS[k][0]}</b> <span class="muted">(Punkt ${k+1} von ${CAL_PTS.length}). Orientier dich an den Zahlen am Rand, im Kamerabild kann die 20 auch unten oder seitlich liegen.</span></p>`}
    ${cam.err?`<p class="err" role="alert">${esc(cam.err)}</p>`:''}
    <canvas id="calcv" class="calcv" width="${cam.calImg?cam.calImg.width:960}" height="${cam.calImg?cam.calImg.height:540}" aria-label="Standbild der Kamera zum Kalibrieren"></canvas>
    <div class="addrow">${fit?'<button class="primary" data-act="calsave">Übernehmen</button><button class="ghost" data-act="calreset">Punkte neu setzen</button>':`<button class="ghost" data-act="calsnap">Neues Standbild</button><button class="ghost" data-act="calundo" ${k?'':'disabled'}>Punkt zurück</button>`}<button class="ghost" data-act="calcancel">Abbrechen</button></div>
    <p class="muted small">Tipp: Die Punkte möglichst genau auf den Draht setzen. Bei Weitwinkel-Kameras weicht das Raster am Rand etwas ab, das ist normal.</p></div>`;
    drawCal();return;
  }
  const slots=cam.devices.length?[0,1,2].map(i=>{
    const ok=!!calOf(i),stale=calStale(i);
    const cc=calOf(i);
    return `<div class="camslot"><div class="camhead"><b>Kamera ${i+1}</b><span class="${ok?'okc':'muted'}">${ok?(cc.auto?'automatisch kalibriert':'kalibriert')+(cc.angled?', schräg':', flach'):stale?'neu kalibrieren':'nicht kalibriert'}</span></div>
    <canvas id="camprev${i}" class="camprev" width="${CW}" height="${CH}" aria-label="Vorschau Kamera ${i+1}"></canvas>
    <p class="muted small camfps" id="camfps${i}"></p>
    ${cam.moved[i]?'<p class="err small">Das Bild weicht stark von der Kalibrierung ab. Wurde die Kamera bewegt? Bitte das Raster prüfen und neu kalibrieren.</p>':''}
    ${stale?'<p class="muted small">Die Auflösung hat ein anderes Seitenverhältnis als bei der Kalibrierung.</p>':''}
    ${ok&&cc.stats?`<p class="${cc.stats.rel<CAL_OK?'muted':'warnt'} small">${statText(cc.stats)}</p>`:''}
    ${cam.health[i]?`<p class="warnt small">${esc(cam.health[i])}</p>`:''}
    ${ok&&Array.isArray(cc.alts)?'<p class="muted small">Lage der 20: wird mit den ersten Würfen bestätigt.</p>':''}
    <label class="olabel" for="camdev${i}">Gerät</label><select id="camdev${i}" class="pinput" data-camdev="${i}"><option value="">Keine Kamera</option>${cam.devices.map((d,j)=>`<option value="${j}" ${cam.slots[i]===d.id?'selected':''}>${esc(d.label)}</option>`).join('')}</select>
    ${cam.diag&&ok?`<p class="diagl" id="camdiag${i}">Diagnose läuft …</p>`:''}
    <div class="addrow"><button class="ghost" data-acal="${i}" ${cam.videos[i]&&!cam.busy?'':'disabled'}>Automatisch</button><button class="ghost" data-cal="${i}" ${cam.videos[i]?'':'disabled'}>Von Hand</button></div></div>`;}).join(''):'';
  const anyFlat=[0,1,2].some(i=>calOf(i)&&!calOf(i).angled);
  const nCal=[0,1,2].filter(i=>calOf(i)).length;
  // Checkliste, solange noch nicht alles läuft
  const steps=[['Autodarts und andere Kamera-Programme ganz schließen (auch unten rechts im Infobereich), eine Kamera kann nur ein Programm benutzen',cam.devices.length>0],
    ['Darts aus dem Board nehmen und für gleichmäßiges Licht sorgen',nCal>0],
    ['„Kameras suchen“: die App findet und kalibriert sie automatisch',nCal>=Math.min(3,cam.devices.length||3)]];
  const checklist=nCal>=3&&!rotPending()?'':`<ol class="camsteps">${steps.map(([t,d])=>`<li class="${d?'done':''}">${d?'✓ ':''}${t}</li>`).join('')}</ol>`;
  app.innerHTML=`<div class="wrap camwide">${hdr}
  ${checklist}
  ${cam.err?`<p class="err" role="alert">${esc(cam.err)}</p>`:''}
  ${cam.sleeping?'<p class="muted">Kameras im Standby, sie starten gleich wieder.</p>':''}
  ${cam.busy?`<p class="camline" role="status">${esc(cam.busy)}</p>`:''}
  ${[0,1,2].some(i=>{const c=calOf(i);return c&&c.globUnsure;})?`<div class="rotcheck" role="status"><b>Steht die große 20 im grünen Raster dort, wo am Board die 20 ist?</b><span class="muted small">Die Lage der 20 kommt aus den Zahlen am Rand und ist nicht ganz sicher.</span><div class="addrow"><button class="primary sm" data-act="rotok">Passt</button><button class="ghost" data-act="rotnext">Die 20 liegt woanders</button></div></div>`:''}
  <div class="addrow" style="margin-bottom:14px"><button class="${cam.devices.length?'ghost':'primary'}" data-act="camscan">${cam.devices.length?'Kameras neu suchen':'Kameras suchen'}</button>${cam.devices.length?`<button class="ghost" data-act="camautoall" ${cam.busy?'disabled':''}>Alle neu kalibrieren</button>`:''}</div>
  <div class="camgrid">${slots}</div>
  ${cam.devices.length?`<button class="primary start" data-act="camtoggle">${cam.active?'Erkennung stoppen':'Erkennung starten'}</button>
  <p class="camline" id="camstat">${esc(cam.last||'Noch kein Wurf erkannt')}</p>
  <figure class="heat"><canvas id="camboard" class="camboard" width="220" height="220" aria-label="Zuletzt erkannte Position"></canvas><figcaption>Zuletzt erkannte Position am Board</figcaption></figure>`:''}
  <details class="more" id="camadv" ${cam.advOpen?'open':''}><summary>Erweitert: Auflösung, Empfindlichkeit, Diagnose</summary>
  ${cam.mode&&cam.streams.some(Boolean)?`<p class="muted small">Angefordert: ${camModeText(cam.mode)}${cam.modeStep?', sparsamer wegen knapper USB-Bandbreite':''}.</p>`:''}
  <section><h2>Kameras</h2>
  <div class="opt"><span class="olabel">Auflösung</span>${segBtns('data-cres',CAM_RES.map((r,k)=>[k,r.n]),cam.res,'Auflösung')}</div>
  <div class="opt"><span class="olabel">Bilder pro Sekunde</span>${segBtns('data-cfps',CAM_FPS.map(f=>[f,String(f)]),cam.fps,'Bilder pro Sekunde')}</div>
  <div class="opt"><span class="olabel">Kameras in Standby nach</span>${segBtns('data-cstby',CAM_STANDBY,cam.standby,'Standby')}</div>
  <div class="opt"><span class="olabel">Beim Start automatisch kalibrieren (neue und verrutschte Kameras)</span>${segBtns('data-cauto',[[false,'Aus'],[true,'An']],cam.autocal,'Beim Start automatisch kalibrieren')}</div></section>
  <section><h2>Erkennung</h2>
  <div class="opt"><span class="olabel">Erkennungsgeschwindigkeit</span>${segBtns('data-cspeed',CAM_SPEED.map((s,k)=>[k,s[0]]),cam.speed,'Erkennungsgeschwindigkeit')}</div>
  <div class="opt"><span class="olabel">Empfindlichkeit</span><div class="seg" role="group" aria-label="Empfindlichkeit">${['Niedrig','Mittel','Hoch'].map((n,i)=>`<button data-sens="${i}" class="${cam.sens===i?'on':''}" aria-pressed="${cam.sens===i}">${n}</button>`).join('')}</div></div>
  <div class="opt"><span class="olabel">Helligkeitsschwelle</span><div class="seg" role="group" aria-label="Helligkeitsschwelle">${[[18,'Fein'],[28,'Normal'],[40,'Grob']].map((c,i)=>`<button data-thr="${i}" class="${cam.thr===c[0]?'on':''}" aria-pressed="${cam.thr===c[0]}">${c[1]}</button>`).join('')}</div></div>
  ${anyFlat?`<div class="opt"><span class="olabel">Erkennungsbereich um die Board-Oberfläche (flache Kameras)</span><div class="seg" role="group" aria-label="Erkennungsbereich">${[[0.06,'Schmal'],[0.12,'Mittel'],[0.2,'Breit']].map((c,i)=>`<button data-mg="${i}" class="${cam.margin===c[0]?'on':''}" aria-pressed="${cam.margin===c[0]}">${c[1]}</button>`).join('')}</div></div>`:''}</section>
  <section><h2>Fehlersuche</h2>
  <div class="addrow" style="margin-bottom:12px"><button class="ghost" data-act="camdiag">${cam.diag?'Diagnose aus':'Diagnose an'}</button><button class="ghost" data-act="camref">Referenzbild neu setzen</button><button class="ghost" data-act="camsave" ${cam.devices.length?'':'disabled'}>Kamerabilder speichern</button></div>
  ${cam.diag?'<p class="muted">Rot zeigt Veränderungen zum Referenzbild im Suchbereich, der gelbe Punkt die gefundene Dartspitze. Ohne Wurf sollte kaum Rot zu sehen sein.</p>':''}
  <p class="muted small">Daneben liegende Würfe korrigierst du im Spiel mit „Rückgängig“ und den Tasten.</p></section>
  </details>
  </div>`;
  camPreview();drawMiniBoard();
}
async function camRestart(){camStop();cam.masks=[];cam.ref=[];cam.prev=[];if(cam.devices.length) await camStart();}
async function camClick(t){
  const a=t.dataset.act;cam.err='';
  if(a==='cam'){renderCam();window.scrollTo(0,0);
    if(!cam.devices.length&&navigator.permissions&&navigator.permissions.query){try{const st=await navigator.permissions.query({name:'camera'});if(st.state==='granted'){await camScan();renderCam();}}catch(e){}}
    return;}
  if(a==='camscan'){app.querySelector('[data-act="camscan"]').textContent='Suche …';await camScan();renderCam();return;}
  if(t.dataset.cal!==undefined){cam.calSlot=+t.dataset.cal;cam.calPts=[];cam.calFit=null;calSnap();renderCam();return;}
  if(t.dataset.cres!==undefined){cam.res=+t.dataset.cres;saveCamSet();await camRestart();renderCam();return;}
  if(t.dataset.cfps!==undefined){cam.fps=CAM_FPS[+t.dataset.cfps];saveCamSet();await camRestart();renderCam();return;}
  if(t.dataset.cspeed!==undefined){cam.speed=+t.dataset.cspeed;saveCamSet();if(cam.timer){clearInterval(cam.timer);cam.timer=setInterval(camTick,camTickMs());}renderCam();return;}
  if(t.dataset.cstby!==undefined){cam.standby=CAM_STANDBY[+t.dataset.cstby][0];saveCamSet();renderCam();return;}
  if(t.dataset.cauto!==undefined){cam.autocal=t.dataset.cauto==='1';saveCamSet();if(cam.autocal){checkMoved();await camAutoAll(true);}renderCam();return;}
  if(t.dataset.acal!==undefined){const i=+t.dataset.acal;cam.busy=`Kalibriere Kamera ${i+1} …`;renderCam();await new Promise(r=>setTimeout(r,30));const r=await camAutoCal(i);cam.busy='';cam.last=r.ok?`Kamera ${i+1} automatisch kalibriert, ${statText(r.stats)}`:`Kamera ${i+1}: ${r.why}`;renderCam();return;}
  if(a==='camautoall'){await camAutoAll(false);renderCam();return;}
  if(a==='camsave'){await camSaveImages();renderCam();return;}
  if(a==='rotok'){confirmRotation();cam.last='Lage der 20 bestätigt';renderCam();return;}
  if(a==='rotnext'){rotateAll(36);cam.last='Raster um zwei Segmente weitergedreht, bitte die 20 erneut prüfen';renderCam();return;}
  if(t.dataset.sens!==undefined){cam.sens=+t.dataset.sens;saveCamSet();renderCam();return;}
  if(t.dataset.thr!==undefined){cam.thr=[18,28,40][+t.dataset.thr];saveCamSet();renderCam();return;}
  if(t.dataset.mg!==undefined){cam.margin=[0.06,0.12,0.2][+t.dataset.mg];saveCamSet();cam.masks=[];renderCam();return;}
  if(a==='camdiag'){cam.advOpen=true;cam.diag=!cam.diag;if(cam.diag&&!cam.active){cam.ref=[];}renderCam();return;}
  if(a==='camref'){cam.ref=[];cam.prev=[];cam.state='idle';cam.last='Referenzbild neu gesetzt';renderCam();return;}
  if(a==='camtoggle'){camToggle();renderCam();return;}
  if(a==='calsnap'){calSnap();drawCal();return;}
  if(a==='calundo'){cam.calPts.pop();renderCam();return;}
  if(a==='calreset'){cam.calPts=[];cam.calFit=null;renderCam();return;}
  if(a==='calsave'){calSave();renderCam();return;}
  if(a==='calcancel'){cam.calSlot=-1;cam.calPts=[];cam.calFit=null;renderCam();}
}
async function camDevChange(sel){
  const i=+sel.dataset.camdev,j=sel.value;
  cam.slots[i]=j===''?null:cam.devices[+j].id;store.set('dart.camslots',cam.slots);
  await camRestart();renderCam();
}

