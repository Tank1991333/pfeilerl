(function(){
'use strict';
// Wird von scripts/build.mjs durch die Version aus package.json ersetzt
const VERSION='__VERSION__'.startsWith('__')?'Entwicklung':'__VERSION__';
const SEGS=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const store={
  get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},
  del(k){try{localStorage.removeItem(k)}catch(e){}}
};
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Fremde Daten (Online-Gegner, großer Bildschirm, Datenbank, Sicherungsdatei) bereinigen, bevor sie
   irgendwo landen: Texte ohne < > " und Backtick, nur endliche Zahlen, keine Prototyp-Schlüssel, begrenzte Tiefe */
function untrusted(v,d=0){
  if(d>12) return null;
  if(typeof v==='string') return v.replace(/[<>"`]/g,'').slice(0,500);
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  if(typeof v==='boolean'||v==null) return v;
  if(Array.isArray(v)) return v.slice(0,2000).map(x=>untrusted(x,d+1));
  if(typeof v!=='object') return null;
  const o={};
  for(const k of Object.keys(v)) if(k!=='__proto__'&&k!=='constructor'&&k!=='prototype') o[k]=untrusted(v[k],d+1);
  return o;
}
const validCode=c=>/^[A-Z0-9]{5}$/.test(c);
const fmt=n=>(Math.round(n*10)/10).toFixed(1).replace('.',',');
const val=d=>d.seg*d.mult;
const label=d=>{
  if(!d.mult) return '–';
  if(d.seg===25) return d.mult===2?'Bull':'25';
  return (d.mult===3?'T':d.mult===2?'D':'')+d.seg;
};
const hitKey=d=>!d.mult?'0':d.seg===25?(d.mult===2?'50':'25'):(d.mult===3?'T':d.mult===2?'D':'S')+d.seg;
const keyLabel=k=>k==='0'?'Daneben':k==='50'?'Bull':k==='25'?'25':k[0]==='S'?k.slice(1):k;
function newId(){return 'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

/* ---------- Checkout ---------- */
const DARTS=(()=>{
  const setup=[],dbl=[],trp=[];
  for(let s=20;s>=1;s--) setup.push({l:'T'+s,v:s*3,m:3});
  setup.push({l:'Bull',v:50,m:2},{l:'25',v:25,m:1});
  for(let s=20;s>=1;s--) setup.push({l:String(s),v:s,m:1});
  for(let s=20;s>=1;s--) setup.push({l:'D'+s,v:s*2,m:2});
  [20,16,18,12,10,8,14,6,4,2,19,17,15,13,11,9,7,5,3,1].forEach(s=>dbl.push({l:'D'+s,v:s*2,m:2}));
  dbl.push({l:'Bull',v:50,m:2});
  for(let s=20;s>=1;s--) trp.push({l:'T'+s,v:s*3,m:3});
  return {setup,dbl,trp};
})();
function checkout(score,darts,out){
  if(score<=0||darts<1) return null;
  const fin=out==='double'?DARTS.dbl:out==='master'?DARTS.dbl.concat(DARTS.trp):DARTS.setup;
  const S=DARTS.setup;
  for(const f of fin) if(f.v===score) return [f.l];
  if(darts>=2) for(const f of fin){const r=score-f.v;if(r<=0)continue;for(const a of S) if(a.v===r) return [a.l,f.l];}
  if(darts>=3) for(const f of fin){const r=score-f.v;if(r<=1)continue;for(const a of S){const r2=r-a.v;if(r2<=0)continue;for(const b of S) if(b.v===r2) return [a.l,b.l,f.l];}}
  return null;
}
function parseT(l){
  if(l==='Bull') return {seg:25,mult:2};
  if(l==='25') return {seg:25,mult:1};
  if(l[0]==='T') return {seg:+l.slice(1),mult:3};
  if(l[0]==='D') return {seg:+l.slice(1),mult:2};
  return {seg:+l,mult:1};
}
function finishAim(score,left,out){
  const c=checkout(score,left,out);
  if(c) return parseT(c[0]);
  if(score>60) return {seg:20,mult:3};
  for(const lv of [40,32,24,16,36,20,8,4,2]){const s=score-lv;if(s>=1&&s<=20) return {seg:s,mult:1};}
  return {seg:1,mult:1};
}

/* ---------- Computer-Gegner ---------- */
const BOTS={1:{n:'Anfänger',s:45},2:{n:'Hobby',s:20},3:{n:'Liga',s:14},4:{n:'Profi',s:9}};
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function aimPoint(t){
  if(t.seg===25) return [0,0];
  const a=(SEGS.indexOf(t.seg)*18-90)*Math.PI/180,r=t.mult===3?103:t.mult===2?166:134;
  return [r*Math.cos(a),r*Math.sin(a)];
}
function classify(x,y){
  const r=Math.hypot(x,y);
  if(r>170) return {seg:0,mult:0};
  if(r<=6.35) return {seg:25,mult:2};
  if(r<=15.9) return {seg:25,mult:1};
  let a=Math.atan2(x,-y)*180/Math.PI;if(a<0)a+=360;
  const seg=SEGS[Math.floor(((a+9)%360)/18)];
  if(r>=99&&r<=107) return {seg,mult:3};
  if(r>=162) return {seg,mult:2};
  return {seg,mult:1};
}
function botThrow(g,p){
  const b=BOTS[p.bot]||BOTS[2];
  const t=MODES[g.mode].aim(g,p,b);
  const [x,y]=aimPoint(t);
  return classify(x+gauss()*b.s,y+gauss()*b.s);
}

/* ---------- Spielmodi ---------- */
const CRICKET=[20,19,18,17,16,15,25];
const ATC=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25];
const BOGEY=[169,168,166,165,163,162,159];
const MARK=['',
  '<svg viewBox="0 0 20 20" aria-label="1"><path d="M4 16L16 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 20 20" aria-label="2"><path d="M4 16L16 4M4 4l12 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 20 20" aria-label="zu"><circle cx="10" cy="10" r="8.2" fill="none" stroke="var(--green)" stroke-width="2"/><path d="M6 14L14 6M6 6l8 8" stroke="var(--green)" stroke-width="2.2" stroke-linecap="round"/></svg>'];
function tiles(g,fn){
  return '<div class="tiles">'+g.players.map((p,i)=>
    `<div class="tile ${i===g.cur&&!g.winner?'cur':''} ${p.out?'out':''}"><div class="pname">${esc(p.name)}</div>${fn(p,i)}</div>`).join('')+'</div>';
}
const nameOnly=(g,p)=>g.players.length>1?p.name:'';
const bobT=g=>g.round<=20?g.round:25;
const ctT=g=>g.list[g.round-1];

const MODES={
  x01:{
    name:'X01',desc:'Von 301, 501 oder 701 genau auf null',scoreCall:true,
    options:[
      {key:'start',label:'Startpunkte',choices:[[101,'101'],[301,'301'],[501,'501'],[701,'701'],[1001,'1001']]},
      {key:'out',label:'Finish',choices:[['double','Double-Out'],['straight','Beliebig'],['master','Master-Out']]},
      {key:'in',label:'Einstieg',choices:[['straight','Beliebig'],['double','Double-In']]},
      {key:'legs',label:'Legs',choices:[[1,'1 Leg'],[2,'Best of 3'],[3,'Best of 5'],[4,'Best of 7']]},
      {key:'sets',label:'Sätze',choices:[[1,'Ohne'],[2,'Best of 3'],[3,'Best of 5']]}
    ],
    sub:o=>[o.start,({double:'Double-Out',straight:'Single-Out',master:'Master-Out'})[o.out],o.in==='double'?'Double-In':'',(o.sets||1)>1?`Best of ${o.sets*2-1} Sätze`:'',(o.legs||1)>1?`Best of ${o.legs*2-1} Legs`:''].filter(Boolean).join(', '),
    init(g){g.leg=1;g.legStarter=0;g.players.forEach(p=>Object.assign(p,{score:g.opts.start,visitStart:g.opts.start,darts:0,isIn:g.opts.in!=='double',best:0,v100:0,v140:0,v180:0,f9:0,f9d:0,coAtt:0,coHit:0,finish:0,visits:0,legs:0,sets:0,legsWon:0,scoredPrev:0,legDarts0:0,bestLeg:0}));},
    dart(g,p,d){
      if(p.isIn&&g.opts.out==='double'&&(p.score===50||(p.score<=40&&p.score%2===0))) p.coAtt++;
      if(p.visits<3) p.f9d++;
      let v=val(d);
      if(!p.isIn){if(d.mult===2) p.isIn=true; else v=0;}
      p.darts++;
      const n=p.score-v,o=g.opts.out;
      if(n<0||(n===0&&o==='double'&&d.mult!==2)||(n===0&&o==='master'&&d.mult<2)||(n===1&&o!=='straight')){p.score=p.visitStart;g.bust=true;g.locked=true;return;}
      p.score=n;
      if(n!==0) return;
      countVisit(p,p.visitStart);
      p.finish=Math.max(p.finish,p.visitStart);p.coHit++;p.legs++;p.legsWon++;{const ld=p.darts-(p.legDarts0||0);if(!p.bestLeg||ld<p.bestLeg)p.bestLeg=ld;}
      const L=g.opts.legs||1,S=g.opts.sets||1;let setWon=false;
      if(p.legs>=L&&S>1){p.sets++;setWon=true;g.players.forEach(q=>q.legs=0);}
      if(S>1?p.sets>=S:p.legs>=L){g.winner=[g.cur];g.msg='Checkout '+p.visitStart;}
      else{g.legDone=true;g.locked=true;g.setWon=setWon;g.msg=(setWon?'Satz':'Leg')+' an '+p.name+', Checkout '+p.visitStart;}
    },
    beforeNext(g){
      if(!g.legDone) return false;
      g.players.forEach(p=>{p.scoredPrev+=g.opts.start-p.score;p.score=g.opts.start;p.visitStart=p.score;p.isIn=g.opts.in!=='double';p.visits=0;p.legDarts0=p.darts;});
      g.leg++;g.legStarter=(g.legStarter+1)%g.players.length;g.cur=g.legStarter;g.round=1;
      g.legDone=false;g.setWon=false;g.msg='';
      return true;
    },
    endVisit(g,p){countVisit(p,p.visitStart-p.score);},
    startVisit(g,p){p.visitStart=p.score;},
    avg:(p,g)=>{const G=g||game;return p.darts?(p.scoredPrev+(G?G.opts.start:0)-p.score)/p.darts*3:0;},
    board(g){
      const L=g.opts.legs||1,S=g.opts.sets||1;
      return tiles(g,p=>`<div class="big">${p.score}</div><div class="meta"><span>Ø ${fmt(MODES.x01.avg(p,g))}</span><span>${p.darts} Darts</span></div>${L>1||S>1?`<div class="ls">${S>1?`<span>Sätze ${p.sets}</span>`:''}<span>Legs ${p.legs}</span></div>`:''}${p.isIn?'':'<div class="note">Double zum Einstieg</div>'}`);
    },
    hint(g,p){const left=3-g.visit.length;if(!p.isIn||left<1) return '';const c=checkout(p.score,left,g.opts.out);return c?'Checkout '+c.join(' '):'';},
    prompt(g,p){return p.isIn&&checkout(p.score,3,g.opts.out)?`${p.name}, du brauchst ${p.score}`:nameOnly(g,p);},
    aim(g,p){if(!p.isIn) return {seg:20,mult:2};return finishAim(p.score,3-g.visit.length,g.opts.out);},
    stats(g){return g.players.map(p=>[p.name,`Ø ${fmt(MODES.x01.avg(p,g))}, beste Aufnahme ${p.best}${(g.opts.legs||1)>1||(g.opts.sets||1)>1?`, ${p.legsWon} Legs`:''}`]);},
    record(g,p){return {scored:p.scoredPrev+g.opts.start-p.score,best:p.best,f9:p.f9,f9d:p.f9d,v100:p.v100,v140:p.v140,v180:p.v180,coAtt:p.coAtt,coHit:p.coHit,checkout:p.finish,legsWon:p.legsWon,bestLeg:p.bestLeg||0,vs:p.vs||[]};}
  },
  cricket:{
    name:'Cricket',desc:'15 bis 20 und Bull schließen, Punkte sammeln',
    options:[{key:'variant',label:'Variante',choices:[['standard','Standard'],['cut','Cut-Throat']]}],
    sub:o=>o.variant==='cut'?'Cut-Throat, wenigste Punkte gewinnen':'Standard, meiste Punkte gewinnen',
    init(g){g.players.forEach(p=>{p.marks={};CRICKET.forEach(t=>p.marks[t]=0);p.points=0;p.darts=0;p.totalMarks=0;});},
    dart(g,p,d){
      p.darts++;
      if(!CRICKET.includes(d.seg)) return;
      const prev=p.marks[d.seg],extra=prev+d.mult-3;
      p.marks[d.seg]=Math.min(3,prev+d.mult);p.totalMarks+=d.mult;
      if(extra>0){
        const open=g.players.filter(o=>o!==p&&o.marks[d.seg]<3);
        if(g.opts.variant==='cut') open.forEach(o=>o.points+=extra*d.seg);
        else if(open.length) p.points+=extra*d.seg;
      }
      const order=[g.cur].concat(g.players.map((_,i)=>i).filter(i=>i!==g.cur));
      for(const i of order){
        const q=g.players[i];
        if(!CRICKET.every(t=>q.marks[t]===3)) continue;
        const others=g.players.filter(o=>o!==q).map(o=>o.points);
        if(!others.length||(g.opts.variant==='cut'?q.points<=Math.min(...others):q.points>=Math.max(...others))){g.winner=[i];g.msg='Alle Felder zu';return;}
      }
    },
    mpr:p=>p.darts?p.totalMarks/(p.darts/3):0,
    targets:()=>CRICKET,
    board(g){
      const ps=g.players,cur=i=>i===g.cur&&!g.winner?'cur':'';
      return `<div class="tw"><table class="cricket"><thead><tr><th><span class="vh">Feld</span></th>${ps.map((p,i)=>`<th class="${cur(i)}">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${
        CRICKET.map(t=>`<tr class="${ps.every(p=>p.marks[t]===3)?'done':''}"><th>${t===25?'Bull':t}</th>${ps.map((p,i)=>`<td class="${cur(i)}">${MARK[p.marks[t]]}</td>`).join('')}</tr>`).join('')
      }</tbody><tfoot><tr><th>Pkt</th>${ps.map((p,i)=>`<td class="${cur(i)}">${p.points}</td>`).join('')}</tr></tfoot></table></div>`;
    },
    hint:()=>'',
    aim(g,p){
      for(const t of CRICKET) if(p.marks[t]<3) return t===25?{seg:25,mult:2}:{seg:t,mult:3};
      for(const t of CRICKET) if(g.players.some(o=>o!==p&&o.marks[t]<3)) return t===25?{seg:25,mult:2}:{seg:t,mult:3};
      return {seg:20,mult:3};
    },
    stats(g){return g.players.map(p=>[p.name,`${p.points} Punkte, ${fmt(MODES.cricket.mpr(p))} Marks pro Runde`]);},
    record(g,p){return {points:p.points,marks:p.totalMarks};}
  },
  atc:{
    name:'Rund um die Uhr',desc:'1 bis 20, dann Bull, der Reihe nach',
    options:[{key:'multi',label:'Double und Triple',choices:[[false,'Zählen einfach'],[true,'Springen 2 bzw. 3 Felder']]}],
    sub:o=>o.multi?'Double und Triple springen weiter':'Jeder Treffer ein Feld weiter',
    init(g){g.players.forEach(p=>{p.idx=0;p.darts=0;p.hits=0;});},
    dart(g,p,d){
      p.darts++;
      const t=ATC[p.idx];
      if(d.seg!==t) return;
      p.hits++;
      if(t===25){p.idx=ATC.length;g.winner=[g.cur];g.msg=p.darts+' Darts';return;}
      p.idx=Math.min(ATC.length-1,p.idx+(g.opts.multi?d.mult:1));
    },
    targets:g=>[ATC[Math.min(g.players[g.cur].idx,ATC.length-1)]],
    board(g){return tiles(g,p=>{
      const t=ATC[Math.min(p.idx,ATC.length-1)];
      return `<div class="big">${p.idx>=ATC.length?'✓':t===25?'Bull':t}</div><div class="bar"><i style="width:${p.idx/ATC.length*100}%"></i></div><div class="meta"><span>${p.darts} Darts</span><span>${p.darts?Math.round(p.hits/p.darts*100):0} % Treffer</span></div>`;});},
    hint(g,p){const t=ATC[p.idx];return 'Ziel '+(t===25?'Bull':t);},
    prompt(g,p){const t=ATC[p.idx];return [nameOnly(g,p),t===25?'Bull':String(t)].filter(Boolean).join(', ');},
    aim(g,p){const t=ATC[p.idx];return t===25?{seg:25,mult:2}:{seg:t,mult:1};},
    stats(g){return g.players.map(p=>[p.name,`${p.idx>=ATC.length?'fertig':'bis '+(ATC[p.idx]===25?'Bull':ATC[p.idx])}, ${p.darts} Darts`]);},
    record(g,p){return {hits:p.hits,done:p.idx>=ATC.length};}
  },
  shanghai:{
    name:'Shanghai',desc:'Pro Runde zählt nur eine Zahl',
    options:[{key:'rounds',label:'Länge',choices:[[7,'7 Runden'],[20,'20 Runden']]}],
    sub:o=>`${o.rounds} Runden, Single, Double und Triple in einer Aufnahme gewinnt sofort`,
    init(g){g.players.forEach(p=>{p.score=0;p.darts=0;});},
    dart(g,p,d){
      p.darts++;
      if(d.seg!==g.round) return;
      p.score+=val(d);
      const ms=new Set(g.visit.filter(x=>x.seg===g.round).map(x=>x.mult));
      if(ms.has(1)&&ms.has(2)&&ms.has(3)){g.winner=[g.cur];g.msg='Shanghai!';}
    },
    onRound(g){
      if(g.round<=g.opts.rounds) return;
      g.round=g.opts.rounds;
      const max=Math.max(...g.players.map(p=>p.score));
      g.winner=g.players.map((p,i)=>p.score===max?i:-1).filter(i=>i>=0);
      g.msg='Alle Runden gespielt';
    },
    targets:g=>[g.round],
    board(g){return tiles(g,p=>`<div class="big">${p.score}</div><div class="meta"><span>${p.darts} Darts</span></div>`);},
    hint(g){return `Runde ${g.round} von ${g.opts.rounds}, Ziel ${g.round}`;},
    prompt(g,p){return g.cur===0?`Runde ${g.round}, ${p.name}`:p.name;},
    aim(g,p,b){return {seg:g.round,mult:b.s>25?1:3};},
    stats(g){return g.players.map(p=>[p.name,`${p.score} Punkte`]);},
    record(g,p){return {score:p.score,shanghai:g.msg==='Shanghai!'&&g.players[g.winner[0]]===p};}
  },
  killer:{
    name:'Killer',desc:'Eigenes Double treffen, dann Gegner jagen',minPlayers:2,
    options:[{key:'lives',label:'Leben',choices:[[3,'3 Leben'],[5,'5 Leben']]}],
    sub:o=>`${o.lives} Leben, nur Doubles zählen`,
    init(g){const nums=shuffle(SEGS.slice());g.players.forEach((p,i)=>Object.assign(p,{num:nums[i],lives:g.opts.lives,killer:false,out:false,darts:0,kills:0}));},
    dart(g,p,d){
      p.darts++;
      if(d.mult!==2||d.seg===25||!d.seg) return;
      const o=g.players.find(q=>q.num===d.seg&&!q.out);
      if(!o) return;
      if(!p.killer){if(o===p){p.killer=true;g.msg=p.name+' ist Killer';}return;}
      o.lives--;if(o!==p) p.kills++;
      if(o.lives<=0){o.lives=0;o.out=true;}
      const alive=g.players.map((q,i)=>q.out?-1:i).filter(i=>i>=0);
      if(alive.length===1){g.winner=alive;g.msg='Letzter Überlebender';return;}
      if(p.out) g.locked=true;
    },
    targets(g){const p=g.players[g.cur];return p.killer?g.players.filter(q=>!q.out&&q!==p).map(q=>q.num):[p.num];},
    board(g){return tiles(g,p=>`<div class="big">${p.num}</div><div class="lives" aria-label="${p.lives} Leben">${'♥'.repeat(p.lives)}<span style="opacity:.25">${'♥'.repeat(Math.max(0,g.opts.lives-p.lives))}</span></div>${p.out?'<span class="badge out">Raus</span>':p.killer?'<span class="badge">Killer</span>':''}`);},
    hint(g,p){return p.killer?'Doubles der Gegner treffen':`Double ${p.num} treffen, um Killer zu werden`;},
    prompt:(g,p)=>p.name,
    aim(g,p){
      if(!p.killer) return {seg:p.num,mult:2};
      const opp=g.players.filter(q=>!q.out&&q!==p).sort((a,b)=>a.lives-b.lives)[0];
      return {seg:opp?opp.num:p.num,mult:2};
    },
    stats(g){return g.players.map(p=>[p.name,`${p.out?'raus':p.lives+' Leben'}, ${p.kills} Abschüsse`]);},
    record(g,p){return {kills:p.kills,lives:p.lives};}
  },
  bobs:{
    name:"Bob's 27",desc:'Doppel-Training von D1 bis Bull',
    options:[{key:'minus',label:'Unter null',choices:[[true,'Raus'],[false,'Weiterspielen']]}],
    sub:o=>'Start mit 27 Punkten, '+(o.minus?'unter null ist raus':'Minus erlaubt'),
    init(g){g.players.forEach(p=>Object.assign(p,{score:27,out:false,hits:0,rh:0,darts:0}));},
    dart(g,p,d){p.darts++;const t=bobT(g);if(d.seg===t&&d.mult===2){p.score+=t*2;p.hits++;p.rh++;}},
    endVisit(g,p){if(p.rh===0){p.score-=bobT(g)*2;if(g.opts.minus&&p.score<0) p.out=true;}p.rh=0;},
    afterVisit(g){if(g.players.every(p=>p.out)) MODES.bobs.finish(g,'Alle unter null');},
    onRound(g){if(g.round>21){g.round=21;MODES.bobs.finish(g,'Alle Doubles gespielt');}},
    finish(g,msg){const max=Math.max(...g.players.map(p=>p.score));g.winner=g.players.map((p,i)=>p.score===max?i:-1).filter(i=>i>=0);g.msg=msg;},
    targets:g=>[bobT(g)],
    board(g){return tiles(g,p=>`<div class="big">${p.score}</div><div class="meta"><span>${p.hits} von ${p.darts} Doubles</span></div>${p.out?'<span class="badge out">Raus</span>':''}`);},
    hint(g){const t=bobT(g);return `Runde ${g.round} von 21, Ziel ${t===25?'Bull':'D'+t}`;},
    prompt(g,p){const t=bobT(g);return [nameOnly(g,p),t===25?'Bull':'Doppel '+t].filter(Boolean).join(', ');},
    aim:g=>({seg:bobT(g),mult:2}),
    stats(g){return g.players.map(p=>[p.name,`${p.score} Punkte, ${p.hits} Doubles${p.out?', raus':''}`]);},
    record(g,p){return {score:p.score,hits:p.hits};}
  },
  ct:{
    name:'Checkout-Training',desc:'Zufällige Finishes mit Double-Out üben',scoreCall:true,
    options:[
      {key:'range',label:'Bereich',choices:[['all','2 bis 170'],['low','2 bis 60'],['mid','61 bis 100'],['high','101 bis 170']]},
      {key:'darts',label:'Darts pro Finish',choices:[[3,'3 Darts'],[6,'6 Darts'],[9,'9 Darts']]},
      {key:'count',label:'Anzahl',choices:[[10,'10 Finishes'],[20,'20 Finishes']]}
    ],
    sub:o=>`${o.count} Finishes von ${({all:'2 bis 170',low:'2 bis 60',mid:'61 bis 100',high:'101 bis 170'})[o.range]}, je ${o.darts} Darts`,
    init(g){
      const [a,b]=({all:[2,170],low:[2,60],mid:[61,100],high:[101,170]})[g.opts.range];
      const pool=[];for(let i=a;i<=b;i++) if(!BOGEY.includes(i)) pool.push(i);
      g.list=Array.from({length:g.opts.count},()=>pool[Math.floor(Math.random()*pool.length)]);
      g.players.forEach(p=>Object.assign(p,{ok:0,att:0,darts:0,fresh:true,rem:0,used:0,visitStart:0,done:false}));
      MODES.ct.startVisit(g,g.players[0]);
    },
    startVisit(g,p){if(p.fresh){p.rem=ctT(g);p.used=0;p.fresh=false;p.done=false;}p.visitStart=p.rem;},
    dart(g,p,d){
      p.darts++;p.used++;
      const n=p.rem-val(d);
      if(n<0||n===1||(n===0&&d.mult!==2)){p.rem=p.visitStart;g.bust=true;g.locked=true;return;}
      p.rem=n;
      if(n===0){p.done=true;p.ok++;g.locked=true;return;}
      if(p.used>=g.opts.darts) g.locked=true;
    },
    endVisit(g,p){if(p.done||p.used>=g.opts.darts){p.att++;p.fresh=true;}},
    keepTurn:(g,p)=>!p.fresh,
    onRound(g){
      if(g.round<=g.list.length) return;
      g.round=g.list.length;
      const max=Math.max(...g.players.map(p=>p.ok));
      g.winner=g.players.map((p,i)=>p.ok===max?i:-1).filter(i=>i>=0);
      g.msg='Training beendet';
    },
    board(g){return tiles(g,p=>`<div class="big">${p.ok}</div><div class="meta"><span>von ${p.att} geschafft</span><span>${p.att?Math.round(p.ok/p.att*100):0} %</span></div>`);},
    hint(g,p){
      const left=Math.min(3-g.visit.length,g.opts.darts-p.used);
      const c=left>0?checkout(p.rem,left,'double'):null;
      return `Finish ${g.round} von ${g.list.length}: ${ctT(g)}, Rest ${p.rem}, noch ${g.opts.darts-p.used} Darts${c?'. Weg: '+c.join(' '):''}`;
    },
    prompt(g,p){return [nameOnly(g,p),p.used===0?'Finish '+ctT(g):'du brauchst '+p.rem].filter(Boolean).join(', ');},
    aim(g,p){return finishAim(p.rem,Math.min(3-g.visit.length,g.opts.darts-p.used),'double');},
    stats(g){return g.players.map(p=>[p.name,`${p.ok} von ${p.att} Finishes`]);},
    record(g,p){return {ok:p.ok,att:p.att};}
  }
};
function countVisit(p,s){
  (p.vs=p.vs||[]).push(s);
  if(p.visits<3) p.f9+=s;
  p.visits++;
  p.best=Math.max(p.best,s);
  if(s>=180) p.v180++; else if(s>=140) p.v140++; else if(s>=100) p.v100++;
}

/* ---------- Party- und Trainingsmodi ---------- */
const CATS=[['spiel','Klassiker'],['party','Party'],['training','Training']];
const HALVE=[15,16,'D',17,18,'T',19,20,'B'];
const hvLabel=t=>t==='D'?'beliebiges Double':t==='T'?'beliebiges Triple':t==='B'?'Bull':String(t);
const hvHit=(t,d)=>!d.mult?false:t==='D'?d.mult===2:t==='T'?d.mult===3:t==='B'?d.seg===25:d.seg===t;
const MICKEY=[20,19,18,17,16,15,14,13,12,'D','T','B'];
const mkLabel=t=>t==='D'?'Double':t==='T'?'Triple':t==='B'?'Bull':t;
function finishBy(g,key,msg,low){
  const v=g.players.map(p=>p[key]),best=low?Math.min(...v):Math.max(...v);
  g.winner=g.players.map((p,i)=>p[key]===best?i:-1).filter(i=>i>=0);g.msg=msg;
}
const jdcT=(g,k)=>{const r=g.round;if(r<=6) return {seg:r+9,kind:'s',part:1};if(r<=13){const i=(r-7)*3+k;return i<21?{seg:ATC[i],kind:'d',part:2}:null;}return {seg:r+1,kind:'s',part:3};};
const dblSeq=g=>g.opts.bull?ATC:ATC.slice(0,20);
const lowAim=(seg,b)=>({seg,mult:b.s>25?1:3});
function finishBoard(g,big,meta){return tiles(g,p=>`<div class="big">${big(p)}</div><div class="meta">${meta(p)}</div>`);}
function attemptHint(g,p,label){
  const left=Math.min(3-g.visit.length,g.opts.darts-p.used),c=left>0?checkout(p.rem,left,'double'):null;
  return `${label}, Rest ${p.rem}, noch ${g.opts.darts-p.used} Darts${c?'. Weg: '+c.join(' '):''}`;
}

Object.assign(MODES,{
  halveit:{
    cat:'party',name:'Halve-It',desc:'Ziel verfehlt? Punkte halbiert',
    options:[{key:'start',label:'Startpunkte',choices:[[40,'40'],[0,'0']]}],
    sub:o=>'9 Runden: 15, 16, Double, 17, 18, Triple, 19, 20, Bull'+(o.start?', Start mit '+o.start:''),
    init(g){g.players.forEach(p=>Object.assign(p,{score:g.opts.start,darts:0,rh:0,halved:0}));},
    dart(g,p,d){p.darts++;if(hvHit(HALVE[g.round-1],d)){p.score+=val(d);p.rh++;}},
    endVisit(g,p){if(!p.rh){p.score=Math.floor(p.score/2);p.halved++;g.flash=p.name+' halbiert auf '+p.score;}p.rh=0;},
    onRound(g){if(g.round>HALVE.length){g.round=HALVE.length;finishBy(g,'score','Alle Runden gespielt');}},
    targets(g){const t=HALVE[g.round-1];return typeof t==='number'?[t]:t==='B'?[25]:null;},
    board(g){return finishBoard(g,p=>p.score,p=>`<span>${p.halved}× halbiert</span>`);},
    hint(g){return `Runde ${g.round} von 9, Ziel: ${hvLabel(HALVE[g.round-1])}`;},
    prompt(g,p){return [nameOnly(g,p),hvLabel(HALVE[g.round-1])].filter(Boolean).join(', ');},
    aim(g){const t=HALVE[g.round-1];return t==='D'?{seg:20,mult:2}:t==='T'?{seg:20,mult:3}:t==='B'?{seg:25,mult:2}:{seg:t,mult:3};},
    stats(g){return g.players.map(p=>[p.name,`${p.score} Punkte, ${p.halved}× halbiert`]);},
    record(g,p){return {score:p.score};}
  },
  baseball:{
    cat:'party',name:'Baseball',desc:'Innings auf 1 bis 9, Runs sammeln',
    options:[{key:'innings',label:'Innings',choices:[[9,'9 Innings'],[5,'5 Innings']]}],
    sub:o=>`${o.innings} Innings, Single 1 Run, Double 2, Triple 3`,
    init(g){g.players.forEach(p=>Object.assign(p,{score:0,darts:0}));},
    dart(g,p,d){p.darts++;if(d.seg===g.round) p.score+=d.mult;},
    onRound(g){if(g.round>g.opts.innings){g.round=g.opts.innings;finishBy(g,'score','Alle Innings gespielt');}},
    targets:g=>[g.round],
    board(g){return finishBoard(g,p=>p.score,()=>'<span>Runs</span>');},
    hint(g){return `Inning ${g.round} von ${g.opts.innings}, Ziel ${g.round}`;},
    prompt(g,p){return g.cur===0?`Inning ${g.round}, ${p.name}`:p.name;},
    aim:(g,p,b)=>lowAim(g.round,b),
    stats(g){return g.players.map(p=>[p.name,`${p.score} Runs`]);},
    record(g,p){return {score:p.score};}
  },
  mickey:{
    cat:'party',name:'Mickey Mouse',desc:'Cricket mit 12 bis 20, Doubles, Triples und Bull',
    options:[{key:'variant',label:'Variante',choices:[['standard','Mit Punkten'],['nopoints','Nur schließen']]}],
    sub:o=>o.variant==='nopoints'?'Wer zuerst alles geschlossen hat, gewinnt':'Felder schließen und Punkte sammeln',
    init(g){g.players.forEach(p=>{p.marks={};MICKEY.forEach(t=>p.marks[t]=0);p.score=0;p.darts=0;p.totalMarks=0;});},
    dart(g,p,d){
      p.darts++;if(!d.mult) return;
      const add=(t,m,pts)=>{
        const prev=p.marks[t],extra=prev+m-3;p.marks[t]=Math.min(3,prev+m);p.totalMarks+=m;
        if(extra>0&&g.opts.variant!=='nopoints'&&g.players.some(o=>o!==p&&o.marks[t]<3)) p.score+=pts(extra);
      };
      if(d.seg>=12&&d.seg<=20) add(d.seg,d.mult,e=>e*d.seg);
      if(d.mult===2) add('D',1,()=>val(d));
      if(d.mult===3) add('T',1,()=>val(d));
      if(d.seg===25) add('B',d.mult,e=>e*25);
      if(MICKEY.every(t=>p.marks[t]===3)){
        const others=g.players.filter(o=>o!==p).map(o=>o.score);
        if(g.opts.variant==='nopoints'||!others.length||p.score>=Math.max(...others)){g.winner=[g.cur];g.msg='Alle Felder zu';}
      }
    },
    targets:()=>null,
    board(g){
      const ps=g.players,cur=i=>i===g.cur&&!g.winner?'cur':'';
      return `<div class="tw"><table class="cricket"><thead><tr><th><span class="vh">Feld</span></th>${ps.map((p,i)=>`<th class="${cur(i)}">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${
        MICKEY.map(t=>`<tr class="${ps.every(p=>p.marks[t]===3)?'done':''}"><th>${mkLabel(t)}</th>${ps.map((p,i)=>`<td class="${cur(i)}">${MARK[p.marks[t]]}</td>`).join('')}</tr>`).join('')
      }</tbody>${g.opts.variant==='nopoints'?'':`<tfoot><tr><th>Pkt</th>${ps.map((p,i)=>`<td class="${cur(i)}">${p.score}</td>`).join('')}</tr></tfoot>`}</table></div>`;
    },
    hint:()=>'',
    aim(g,p){
      const pick=t=>t==='D'?{seg:20,mult:2}:t==='T'?{seg:20,mult:3}:t==='B'?{seg:25,mult:2}:{seg:t,mult:3};
      for(const t of MICKEY) if(p.marks[t]<3) return pick(t);
      for(const t of MICKEY) if(g.players.some(o=>o!==p&&o.marks[t]<3)) return pick(t);
      return {seg:20,mult:3};
    },
    stats(g){return g.players.map(p=>[p.name,g.opts.variant==='nopoints'?`${MICKEY.filter(t=>p.marks[t]===3).length} von 12 Feldern zu`:`${p.score} Punkte`]);},
    record(g,p){return {score:p.score,marks:p.totalMarks};}
  },
  gotcha:{
    cat:'party',name:'Gotcha',desc:'Gleicher Stand wie ein Gegner? Der fällt auf null',statKind:'wins',
    options:[{key:'target',label:'Ziel',choices:[[301,'301'],[501,'501']]}],
    sub:o=>`Hochzählen bis genau ${o.target}, Überwerfen zählt nicht`,
    init(g){g.players.forEach(p=>Object.assign(p,{score:0,visitStart:0,darts:0,resets:0}));},
    startVisit(g,p){p.visitStart=p.score;},
    dart(g,p,d){
      p.darts++;const n=p.score+val(d);
      if(n>g.opts.target){p.score=p.visitStart;g.bust=true;g.locked=true;return;}
      p.score=n;if(!val(d)) return;
      g.players.forEach(o=>{if(o!==p&&o.score===n){o.score=0;o.visitStart=0;p.resets++;g.msg=`Gotcha! ${o.name} fällt auf null`;}});
      if(n===g.opts.target){g.winner=[g.cur];g.msg='Genau '+n;}
    },
    board(g){return finishBoard(g,p=>p.score,p=>`<span>noch ${g.opts.target-p.score}</span><span>${p.resets} Gotchas</span>`);},
    hint(g,p){const r=g.opts.target-p.score,left=3-g.visit.length,c=left?checkout(r,left,'straight'):null;return `Noch ${r}${c?'. Weg: '+c.join(' '):''}`;},
    prompt(g,p){return `${p.name}, noch ${g.opts.target-p.score}`;},
    aim(g,p){const r=g.opts.target-p.score;return r>60?{seg:20,mult:3}:finishAim(r,3-g.visit.length,'straight');},
    stats(g){return g.players.map(p=>[p.name,`${p.score} Punkte, ${p.resets} Gotchas`]);},
    record(g,p){return {score:p.score,resets:p.resets};}
  },
  golf:{
    cat:'party',name:'Golf',desc:'Löcher 1 bis 9 oder 18, wenig Schläge gewinnen',statKind:'low',
    options:[{key:'holes',label:'Löcher',choices:[[9,'9 Löcher'],[18,'18 Löcher']]}],
    sub:o=>`${o.holes} Löcher, bester Dart zählt: Triple 1, Double 2, Single 3, verfehlt 5 Schläge`,
    init(g){g.players.forEach(p=>Object.assign(p,{score:0,darts:0,hole:5,played:0}));},
    dart(g,p,d){p.darts++;if(d.seg===g.round){const s=d.mult===3?1:d.mult===2?2:3;p.hole=Math.min(p.hole,s);if(s===1){g.locked=true;g.msg='Hole in One!';}}},
    endVisit(g,p){p.score+=p.hole;p.played++;p.hole=5;},
    onRound(g){if(g.round>g.opts.holes){g.round=g.opts.holes;finishBy(g,'score','Alle Löcher gespielt',true);}},
    targets:g=>[g.round],
    board(g){return finishBoard(g,p=>p.score,p=>`<span>${p.played} Löcher</span>${p.hole<5?`<span>jetzt ${p.hole}</span>`:''}`);},
    hint(g,p){return `Loch ${g.round} von ${g.opts.holes}, Ziel ${g.round}${p.hole<5?', bisher '+p.hole+(p.hole===1?' Schlag':' Schläge'):''}`;},
    prompt(g,p){return g.cur===0?`Loch ${g.round}, ${p.name}`:p.name;},
    aim:(g,p,b)=>lowAim(g.round,b),
    stats(g){return g.players.map(p=>[p.name,`${p.score} Schläge`]);},
    record(g,p){return {score:p.score};}
  },
  elim:{
    cat:'party',name:'Elimination',desc:'Gleicher Rest wie ein Gegner? Der muss zurück an den Start',statKind:'wins',
    options:[{key:'start',label:'Startpunkte',choices:[[301,'301'],[501,'501']]}],
    sub:o=>`${o.start}, Single-Out, gleicher Rest schickt den Gegner zurück auf ${o.start}`,
    init(g){g.players.forEach(p=>Object.assign(p,{score:g.opts.start,visitStart:g.opts.start,darts:0,elims:0}));},
    startVisit(g,p){p.visitStart=p.score;},
    dart(g,p,d){p.darts++;const n=p.score-val(d);if(n<0){p.score=p.visitStart;g.bust=true;g.locked=true;return;}p.score=n;if(n===0){g.winner=[g.cur];g.msg='Ausgecheckt';}},
    endVisit(g,p){
      if(p.score===p.visitStart) return;
      g.players.forEach(o=>{if(o!==p&&o.score===p.score){o.score=g.opts.start;o.visitStart=o.score;p.elims++;g.flash=`${o.name} muss zurück auf ${g.opts.start}`;}});
    },
    board(g){return finishBoard(g,p=>p.score,p=>`<span>${p.elims} Rauswürfe</span>`);},
    hint(g,p){const left=3-g.visit.length,c=left?checkout(p.score,left,'straight'):null;return c?'Checkout '+c.join(' '):'';},
    prompt(g,p){return `${p.name}, noch ${p.score}`;},
    aim(g,p){return finishAim(p.score,3-g.visit.length,'straight');},
    stats(g){return g.players.map(p=>[p.name,`Rest ${p.score}, ${p.elims} Rauswürfe`]);},
    record(g,p){return {elims:p.elims};}
  },
  hare:{
    cat:'party',name:'Hare and Hounds',desc:'Der Hase flüchtet ums Board, die Hunde jagen ihn',statKind:'wins',minPlayers:2,
    options:[{key:'lead',label:'Vorsprung des Hasen',choices:[[3,'3 Felder'],[5,'5 Felder']]}],
    sub:o=>`Spieler 1 ist der Hase mit ${o.lead} Feldern Vorsprung, alle laufen im Uhrzeigersinn von der 20 zurück zur 20`,
    init(g){g.players.forEach((p,i)=>Object.assign(p,{pos:i===0?g.opts.lead:0,darts:0,hits:0,hare:i===0}));},
    dart(g,p,d){
      p.darts++;
      if(d.seg!==SEGS[p.pos%20]) return;
      p.pos++;p.hits++;
      const hare=g.players[0];
      if(p.hare){if(p.pos>=21){g.winner=[0];g.msg='Der Hase ist entkommen';}}
      else if(p.pos>=hare.pos){g.winner=[g.cur];g.msg=p.name+' hat den Hasen gefangen';}
    },
    targets(g){return [SEGS[g.players[g.cur].pos%20]];},
    board(g){return tiles(g,p=>`<div class="big">${SEGS[p.pos%20]}</div><div class="bar"><i style="width:${Math.min(100,p.pos/21*100)}%"></i></div><span class="badge ${p.hare?'':'ok'}">${p.hare?'Hase':'Hund'}</span>`);},
    hint(g,p){const h=g.players[0];return `Ziel ${SEGS[p.pos%20]}`+(p.hare?`, noch ${21-p.pos} Felder bis zur Flucht`:`, der Hase steht bei ${SEGS[h.pos%20]}, ${h.pos-p.pos} Felder voraus`);},
    prompt(g,p){return `${p.name}, ${SEGS[p.pos%20]}`;},
    aim(g,p){return {seg:SEGS[p.pos%20],mult:1};},
    stats(g){return g.players.map(p=>[p.name,`${p.hare?'Hase':'Hund'}, ${p.hits} Felder gelaufen`]);},
    record(g,p){return {hare:p.hare};}
  },
  c121:{
    cat:'training',name:'121 Checkout',desc:'Auschecken mit 9 Darts, das Ziel steigt bei Erfolg',statKind:'top',scoreCall:true,
    options:[{key:'count',label:'Versuche',choices:[[10,'10 Versuche'],[20,'20 Versuche']]},{key:'darts',label:'Darts pro Versuch',choices:[[9,'9 Darts'],[6,'6 Darts']]}],
    sub:o=>`Start bei 121, ${o.darts} Darts pro Versuch, Erfolg plus 1, Fehlversuch minus 1, ${o.count} Versuche`,
    init(g){g.players.forEach(p=>Object.assign(p,{target:121,best:0,ok:0,att:0,darts:0,fresh:true,rem:0,used:0,visitStart:0,done:false}));MODES.c121.startVisit(g,g.players[0]);},
    startVisit(g,p){if(p.fresh){p.rem=p.target;p.used=0;p.fresh=false;p.done=false;}p.visitStart=p.rem;},
    dart(g,p,d){MODES.ct.dart(g,p,d);},
    endVisit(g,p){if(p.done||p.used>=g.opts.darts){p.att++;p.fresh=true;if(p.done){p.best=Math.max(p.best,p.target);p.target++;}else p.target=Math.max(121,p.target-1);}},
    keepTurn:(g,p)=>!p.fresh,
    onRound(g){if(g.round>g.opts.count){g.round=g.opts.count;finishBy(g,'best','Alle Versuche gespielt');}},
    board(g){return finishBoard(g,p=>p.target,p=>`<span>${p.ok} von ${p.att}</span><span>Bestes ${p.best||'–'}</span>`);},
    hint(g,p){return attemptHint(g,p,`Versuch ${g.round} von ${g.opts.count}: ${p.target}`);},
    prompt(g,p){return [nameOnly(g,p),p.used===0?'Finish '+p.target:'du brauchst '+p.rem].filter(Boolean).join(', ');},
    aim(g,p){return finishAim(p.rem,Math.min(3-g.visit.length,g.opts.darts-p.used),'double');},
    stats(g){return g.players.map(p=>[p.name,`bestes Finish ${p.best||'–'}, ${p.ok} von ${p.att} geschafft`]);},
    record(g,p){return {best:p.best,ok:p.ok,att:p.att};}
  },
  doubles:{
    cat:'training',name:'Doppel-Runde',desc:'D1 bis D20 der Reihe nach, wenig Darts zählen',statKind:'darts',
    options:[{key:'bull',label:'Bull am Ende',choices:[[true,'Mit Bull'],[false,'Ohne Bull']]}],
    sub:o=>o.bull?'Alle Doubles von 1 bis 20, dann Bull':'Alle Doubles von 1 bis 20',
    init(g){g.players.forEach(p=>Object.assign(p,{idx:0,darts:0,hits:0,done:false}));},
    dart(g,p,d){
      p.darts++;const s=dblSeq(g),t=s[p.idx];
      if(d.seg===t&&d.mult===2){p.hits++;p.idx++;if(p.idx>=s.length){p.done=true;g.winner=[g.cur];g.msg=p.darts+' Darts';}}
    },
    targets(g){const s=dblSeq(g);return [s[Math.min(g.players[g.cur].idx,s.length-1)]];},
    board(g){const s=dblSeq(g);return tiles(g,p=>{const t=s[Math.min(p.idx,s.length-1)];return `<div class="big">${p.done?'✓':t===25?'Bull':'D'+t}</div><div class="bar"><i style="width:${p.idx/s.length*100}%"></i></div><div class="meta"><span>${p.darts} Darts</span><span>${p.darts?Math.round(p.hits/p.darts*100):0} %</span></div>`;});},
    hint(g,p){const t=dblSeq(g)[p.idx];return 'Ziel '+(t===25?'Bull':'Double '+t);},
    prompt(g,p){const t=dblSeq(g)[p.idx];return [nameOnly(g,p),t===25?'Bull':'Doppel '+t].filter(Boolean).join(', ');},
    aim(g,p){return {seg:dblSeq(g)[p.idx],mult:2};},
    stats(g){return g.players.map(p=>[p.name,`${p.done?'fertig':'bis '+(dblSeq(g)[p.idx]===25?'Bull':'D'+dblSeq(g)[p.idx])}, ${p.darts} Darts`]);},
    record(g,p){return {hits:p.hits,done:p.done};}
  },
  score100:{
    cat:'training',name:'100 Darts',desc:'33 Aufnahmen auf die 20, sauberer Trainings-Average',statKind:'avg',scoreCall:true,
    options:[{key:'visits',label:'Umfang',choices:[[33,'33 Aufnahmen'],[11,'11 Aufnahmen']]},{key:'target',label:'Ziel',choices:[[20,'T20'],[19,'T19']]}],
    sub:o=>`${o.visits} Aufnahmen auf T${o.target}, alle Punkte zählen`,
    init(g){g.players.forEach(p=>Object.assign(p,{score:0,visitStart:0,darts:0,best:0,ton:0}));},
    startVisit(g,p){p.visitStart=p.score;},
    dart(g,p,d){p.darts++;p.score+=val(d);},
    endVisit(g,p){const s=p.score-p.visitStart;p.best=Math.max(p.best,s);if(s>=100) p.ton++;},
    onRound(g){if(g.round>g.opts.visits){g.round=g.opts.visits;finishBy(g,'score','Training beendet');}},
    targets:g=>[g.opts.target],
    board(g){return finishBoard(g,p=>p.score,p=>`<span>Ø ${fmt(p.darts?p.score/p.darts*3:0)}</span><span>${p.ton}× 100+</span>`);},
    hint(g){return `Aufnahme ${g.round} von ${g.opts.visits}, Ziel T${g.opts.target}`;},
    prompt:(g,p)=>nameOnly(g,p),
    aim:g=>({seg:g.opts.target,mult:3}),
    stats(g){return g.players.map(p=>[p.name,`${p.score} Punkte, Ø ${fmt(p.darts?p.score/p.darts*3:0)}, beste Aufnahme ${p.best}`]);},
    record(g,p){return {score:p.score,best:p.best,ton:p.ton};}
  },
  catch40:{
    cat:'training',name:'Catch 40',desc:'Finishes 61 bis 100, schnelle Checks bringen Punkte',scoreCall:true,
    options:[{key:'count',label:'Umfang',choices:[[40,'61 bis 100'],[20,'61 bis 80']]}],
    sub:o=>`${o.count} Finishes ab 61, je 6 Darts. Check mit 2 Darts 3 Punkte, mit 3 Darts 2, sonst 1`,
    init(g){g.opts.darts=6;g.players.forEach(p=>Object.assign(p,{score:0,ok:0,att:0,darts:0,fresh:true,rem:0,used:0,visitStart:0,done:false}));MODES.catch40.startVisit(g,g.players[0]);},
    startVisit(g,p){if(p.fresh){p.rem=60+g.round;p.used=0;p.fresh=false;p.done=false;}p.visitStart=p.rem;},
    dart(g,p,d){MODES.ct.dart(g,p,d);},
    endVisit(g,p){if(p.done||p.used>=6){p.att++;if(p.done) p.score+=p.used<=2?3:p.used===3?2:1;p.fresh=true;}},
    keepTurn:(g,p)=>!p.fresh,
    onRound(g){if(g.round>g.opts.count){g.round=g.opts.count;finishBy(g,'score','Alle Finishes gespielt');}},
    board(g){return finishBoard(g,p=>p.score,p=>`<span>${p.ok} von ${p.att} geschafft</span>`);},
    hint(g,p){return attemptHint(g,p,`Finish ${60+g.round}`);},
    prompt(g,p){return [nameOnly(g,p),p.used===0?'Finish '+(60+g.round):'du brauchst '+p.rem].filter(Boolean).join(', ');},
    aim(g,p){return finishAim(p.rem,Math.min(3-g.visit.length,6-p.used),'double');},
    stats(g){return g.players.map(p=>[p.name,`${p.score} Punkte, ${p.ok} von ${p.att} geschafft`]);},
    record(g,p){return {score:p.score,ok:p.ok,att:p.att};}
  },
  jdc:{
    cat:'training',name:'JDC Challenge',desc:'Offizielles Jugendtraining: Shanghai, Doubles, Shanghai',
    options:[],
    sub:()=>'Teil 1: 10 bis 15, Teil 2: alle Doubles bis Bull mit je 50 Punkten, Teil 3: 15 bis 20. Shanghai bringt 100 Bonus',
    init(g){g.players.forEach(p=>Object.assign(p,{score:0,darts:0,dh:0,sh:0}));},
    dart(g,p,d){
      p.darts++;const t=jdcT(g,g.visit.length-1);if(!t) return;
      if(t.kind==='d'){if(d.seg===t.seg&&d.mult===2){p.score+=50;p.dh++;}}
      else if(d.seg===t.seg) p.score+=val(d);
    },
    endVisit(g,p){
      const t=jdcT(g,0);if(!t||t.kind!=='s') return;
      const ms=new Set(g.visit.filter(x=>x.seg===t.seg).map(x=>x.mult));
      if(ms.has(1)&&ms.has(2)&&ms.has(3)){p.score+=100;p.sh++;g.flash='Shanghai! 100 Bonuspunkte für '+p.name;}
    },
    onRound(g){if(g.round>19){g.round=19;finishBy(g,'score','Challenge beendet');}},
    targets(g){const t=jdcT(g,Math.min(g.visit.length,2));return t?[t.seg]:null;},
    board(g){return finishBoard(g,p=>p.score,p=>`<span>${p.dh} Doubles</span><span>${p.sh}× Shanghai</span>`);},
    hint(g){
      const t=jdcT(g,Math.min(g.visit.length,2));if(!t) return '';
      if(t.kind==='d') return `Teil 2, Runde ${g.round} von 19: nächster Dart auf ${t.seg===25?'Bull':'D'+t.seg}`;
      return `Teil ${t.part}, Runde ${g.round} von 19: Ziel ${t.seg}`;
    },
    prompt(g,p){const t=jdcT(g,0);return [nameOnly(g,p),t.kind==='d'?'Doubles ab '+t.seg:String(t.seg)].filter(Boolean).join(', ');},
    aim(g,p,b){const t=jdcT(g,g.visit.length);return !t?{seg:20,mult:1}:t.kind==='d'?{seg:t.seg,mult:2}:lowAim(t.seg,b);},
    stats(g){return g.players.map(p=>[p.name,`${p.score} Punkte, ${p.dh} Doubles`]);},
    record(g,p){return {score:p.score,dh:p.dh};}
  }
});
['x01','cricket','atc','shanghai','killer'].forEach(k=>MODES[k].cat='spiel');
['bobs','ct'].forEach(k=>MODES[k].cat='training');

/* ---------- Zustand ---------- */
const DEFAULTS={mode:'x01',voice:false,players:[{name:'Spieler 1'},{name:'Spieler 2'}],opts:{
  x01:{start:501,out:'double',in:'straight',legs:1,sets:1},cricket:{variant:'standard'},atc:{multi:false},shanghai:{rounds:7},
  killer:{lives:3},bobs:{minus:true},ct:{range:'all',darts:6,count:10},
  halveit:{start:40},baseball:{innings:9},mickey:{variant:'standard'},gotcha:{target:301},golf:{holes:9},elim:{start:301},hare:{lead:3},
  c121:{count:10,darts:9},doubles:{bull:true},score100:{visits:33,target:20},catch40:{count:40},jdc:{}}};
let setup=store.get('dart.setup');
if(!setup||!setup.opts) setup=clone(DEFAULTS);
for(const k in DEFAULTS.opts) setup.opts[k]=Object.assign({},DEFAULTS.opts[k],setup.opts[k]||{});
if(!MODES[setup.mode]) setup.mode='x01';
if(!Array.isArray(setup.players)||!setup.players.length) setup.players=clone(DEFAULTS.players);
setup.players=setup.players.map(x=>typeof x==='string'?{name:x}:x);
if(typeof setup.voice!=='boolean') setup.voice=false;
if(typeof setup.walkon!=='boolean') setup.walkon=false;
if(!Array.isArray(setup.sets)) setup.sets=[];
if(!Array.isArray(setup.regulars)) setup.regulars=[];
if(!Array.isArray(setup.recent)) setup.recent=[];
if(!['auto','light','dark'].includes(setup.theme)) setup.theme='auto';
let setupProf=-1,setupAll=false,setupMore=false,setupMsg='',moreErr='',setDraft={n:'',w:''};
const validGame=g=>!!(g&&typeof g==='object'&&MODES[g.mode]&&Array.isArray(g.players)&&g.players.length>=1&&g.players.length<=8&&g.players.every(p=>p&&typeof p==='object')&&Number.isInteger(g.cur)&&g.cur>=0&&g.cur<g.players.length);

let saved=store.get('dart.game');
let game=null,history=[],quitArmed=false,wakeLock=null,mod=1,botTimer=null,setupErr='';
const app=document.getElementById('app');
const saveSetup=()=>store.set('dart.setup',setup);
const saveGame=()=>{store.set('dart.game',{g:game,h:history.slice(-200)});if(onl||scr) pushOnline();};
const isBotTurn=()=>!!(game&&!game.winner&&game.players[game.cur].bot);

/* ---------- Sprachausgabe ---------- */
function say(t){
  if(!t||!setup.voice||!window.speechSynthesis) return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(t);u.lang='de-DE';
    const v=speechSynthesis.getVoices().find(v=>v.lang&&v.lang.toLowerCase().startsWith('de'));
    if(v) u.voice=v;
    speechSynthesis.speak(u);
  }catch(e){}
}
function visitCall(g,p){
  if(g.legDone) return `Game shot und ${g.setWon?'der Satz':'das Leg'}, ${p.name}`;
  if(!MODES[g.mode].scoreCall) return '';
  if(g.bust) return 'Überworfen';
  if(g.mode==='ct'&&p.done) return 'Check';
  const s=g.visit.reduce((a,d)=>a+val(d),0);
  return s===180?'Einhundertachtzig! Leiwand!':s===0?'Keine Punkte':String(s);
}
function winCall(g){
  const n=g.winner.map(i=>g.players[i].name);
  if(n.length>1) return 'Unentschieden';
  if(g.mode==='x01') return 'Game shot und das Match, '+n[0];
  return (g.msg==='Shanghai!'?'Shanghai! ':'')+n[0]+' gewinnt';
}
function promptCall(g){const m=MODES[g.mode],p=g.players[g.cur];return m.prompt?m.prompt(g,p):nameOnly(g,p);}

/* ---------- Setup ---------- */
function renderSetup(){
  const m=MODES[setup.mode],o=setup.opts[setup.mode];
  saved=store.get('dart.game');
  const resume=saved&&validGame(saved.g)&&!saved.g.winner?
    `<div class="resume"><span>Laufendes Spiel<small>${esc(MODES[saved.g.mode].name)} mit ${saved.g.players.map(p=>esc(p.name)).join(', ')}</small></span><button class="primary" data-act="resume">Fortsetzen</button></div>`:'';
  const seg=(attr,choices,cur,lab)=>`<div class="seg" role="group" aria-label="${lab}">${choices.map((c,i)=>`<button ${attr}="${i}" class="${cur===c[0]?'on':''}" aria-pressed="${cur===c[0]}">${c[1]}</button>`).join('')}</div>`;
  const modeBtn=([k,x])=>`<button class="mode cat-${x.cat} ${k===setup.mode?'on':''}" data-mode="${k}" aria-pressed="${k===setup.mode}"><span class="mname">${x.name}</span><span class="mdesc">${x.desc}</span></button>`;
  const nModes=Object.keys(MODES).length;
  const modes=setupAll?
    CATS.map(([c,cn])=>`<h3 class="cath c-${c}">${cn}</h3><div class="modes">${Object.entries(MODES).filter(([,x])=>x.cat===c).map(modeBtn).join('')}</div>`).join('')+`<button class="ghost more" data-act="modesless" aria-expanded="true">Weniger zeigen</button>`:
    `<h3 class="cath">${setup.recent.length?'Zuletzt gespielt':'Beliebt'}</h3><div class="modes">${quickModes().map(k=>modeBtn([k,MODES[k]])).join('')}</div><button class="ghost more" data-act="modesall" aria-expanded="false">Alle ${nModes} Spielmodi zeigen</button>`;
  const inGame=new Set(setup.players.map(p=>(p.name||'').trim()));
  const regs=setup.regulars.filter(r=>!inGame.has(r.name));
  app.innerHTML=`<div class="wrap setup">
  <header class="top"><div class="toprow"><h1 class="brand">${LOGO}Pfeilerl</h1></div><p>Dart zählen, ganz ohne Kopfrechnen</p><div class="tbtns"><button class="ghost" data-act="coach">Trainer</button><button class="ghost" data-act="tour">Turnier${tour?' läuft':''}</button><button class="ghost" data-act="online">Online</button><button class="ghost" data-act="tv">Bildschirm</button><button class="ghost" data-act="cam">Kamera${cam.active?' an':''}</button><button class="ghost" data-act="stats">Statistik</button></div></header>
  ${resume}
  <section><h2>Spielmodus</h2>${modes}</section>
  <section><h2>Regeln${setupAll?'':` <span class="muted">${esc(m.name)}</span>`}</h2>${m.options.map(op=>`<div class="opt"><span class="olabel">${op.label}</span>${
    `<div class="seg" role="group" aria-label="${op.label}">${op.choices.map((c,i)=>`<button data-opt="${op.key}" data-ci="${i}" class="${o[op.key]===c[0]?'on':''}" aria-pressed="${o[op.key]===c[0]}">${c[1]}</button>`).join('')}</div>`}</div>`).join('')}
  <div class="opt"><span class="olabel">Ansage per Sprache</span>${seg('data-voice',[[false,'Aus'],[true,'An']],setup.voice,'Ansage')}</div>
  <div class="opt"><span class="olabel">Einlauf mit Musik vor dem Spiel</span>${seg('data-walk',[[false,'Aus'],[true,'An']],setup.walkon,'Einlauf')}</div></section>
  <section><h2>Spieler</h2><ol class="players">${setup.players.map((pl,i)=>pl.bot?
    `<li><span class="num">${i+1}</span><div class="botrow"><span class="botname">${esc(pl.name)}</span><div class="seg" role="group" aria-label="Stärke">${Object.entries(BOTS).map(([k,b])=>`<button data-bl="${i}" data-lv="${k}" class="${pl.bot===+k?'on':''}" aria-pressed="${pl.bot===+k}">${b.n}</button>`).join('')}</div></div><button class="icon" data-rm="${i}" ${setup.players.length<2?'disabled':''} aria-label="Computer entfernen">✕</button></li>`:
    `<li><span class="num">${i+1}</span><div class="pcol"><input data-pi="${i}" value="${esc(pl.name)}" maxlength="16" aria-label="Name Spieler ${i+1}">${pl.nick||pl.set||pl.jingle?`<span class="psum">${[pl.nick?'„'+esc(pl.nick)+'“':'',pl.set?esc(setLabel(pl.set)):'',pl.jingle?esc(pl.jingle==='file'?'Eigene Musik':(JINGLES[pl.jingle]||JINGLES.fanfare).n):''].filter(Boolean).join(', ')}</span>`:''}</div><button class="icon ${setupProf===i?'on':''}" data-prof="${i}" aria-label="Profil von Spieler ${i+1}" aria-expanded="${setupProf===i}">⚙</button><button class="icon" data-rm="${i}" ${setup.players.length<2?'disabled':''} aria-label="Spieler ${i+1} entfernen">✕</button></li>${setupProf===i?profPanel(pl,i):''}`).join('')}</ol>
  ${regs.length&&setup.players.length<8?`<div class="regs"><span class="olabel">Stammspieler antippen zum Hinzufügen</span><div class="chips">${regs.map(r=>`<button class="chip" data-reg="${esc(r.name)}">${esc(r.name)}</button>`).join('')}</div></div>`:''}
  ${setup.players.length<8?'<div class="addrow"><button class="ghost" data-act="add">Spieler hinzufügen</button><button class="ghost" data-act="addbot">Computer hinzufügen</button></div>':''}</section>
  ${setupErr?`<p class="err" role="alert">${esc(setupErr)}</p>`:''}
  <button class="primary start" data-act="start">Spiel starten</button>
  <details class="more" id="more" ${setupMore?'open':''}><summary>Einstellungen, Dart-Sets und Datensicherung</summary>
  <section><h2>Design</h2>${seg('data-theme',[['auto','Wie Gerät'],['light','Hell'],['dark','Dunkel']],setup.theme,'Design')}</section>
  <section><h2>Dart-Sets</h2>${setup.sets.length?`<ul class="sets">${setup.sets.map(st=>`<li><span>${esc(setLabelS(st))}</span><button class="icon" data-delset="${st.id}" aria-label="Set ${esc(st.name)} löschen">✕</button></li>`).join('')}</ul>`:'<p class="muted">Lege deine Pfeile an und wähle sie im Spielerprofil (⚙). Die Statistik vergleicht dann, mit welchem Set du besser triffst.</p>'}
  <div class="setrow"><input id="setname" value="${esc(setDraft.n)}" placeholder="Name, z. B. Blaue 22er" maxlength="24" aria-label="Name des Sets"><input id="setw" value="${esc(setDraft.w)}" inputmode="decimal" placeholder="Gramm" maxlength="5" aria-label="Gewicht in Gramm"><button class="ghost" data-act="addset">Anlegen</button></div>${moreErr&&moreErr.where==='sets'?`<p class="err" role="alert">${esc(moreErr.text)}</p>`:''}</section>
  <section><h2>Stammspieler</h2>${setup.regulars.length?`<ul class="sets">${setup.regulars.map(r=>`<li><span>${esc(r.name)}</span><button class="icon" data-delreg="${esc(r.name)}" aria-label="${esc(r.name)} aus den Stammspielern entfernen">✕</button></li>`).join('')}</ul>`:'<p class="muted">Wer mitspielt, landet automatisch hier. Danach reicht ein Tipp auf den Namen, Spitzname, Dart-Set und Einlauf kommen mit.</p>'}</section>
  <section><h2>Datensicherung</h2><p class="muted">Sichere Statistik, Stammspieler und Dart-Sets als Datei, etwa vor einem Handywechsel. Beim Wiederherstellen kommen nur fehlende Spiele dazu, nichts wird überschrieben.</p>
  <div class="addrow"><button class="ghost" data-act="backup">Sicherung speichern</button><label class="ghost filebtn">Sicherung einspielen<input type="file" accept=".json,application/json" id="restore" class="vh"></label></div>${setupMsg?`<p class="okmsg" role="status">${esc(setupMsg)}</p>`:''}${moreErr&&moreErr.where==='backup'?`<p class="err" role="alert">${esc(moreErr.text)}</p>`:''}</section>
  </details>
  <p class="ver">Pfeilerl Version ${VERSION}</p>
  </div>`;
  setupMsg='';moreErr='';
}
function quickModes(){
  const ks=setup.recent.filter(k=>MODES[k]);
  for(const k of ['x01','cricket','atc','killer']) if(ks.length<4&&!ks.includes(k)) ks.push(k);
  const q=ks.slice(0,4);
  if(!q.includes(setup.mode)) q[q.length-1]=setup.mode;
  return q;
}
function applyTheme(){
  const r=document.documentElement;if(!r||!r.dataset) return;
  if(setup.theme==='auto') delete r.dataset.theme; else r.dataset.theme=setup.theme;
}
/* Gleiche Namen (ohne Groß-/Kleinschreibung), leere Felder zählen als „Spieler N“ */
function dupName(players){
  const seen=new Set();
  for(let i=0;i<players.length;i++){const n=((players[i].name||'').trim()||'Spieler '+(i+1));const k=n.toLowerCase();if(seen.has(k)) return n;seen.add(k);}
  return '';
}
/* Stammspieler: wer mitspielt, wird gemerkt (neueste zuerst, höchstens 30) */
const isDefaultName=n=>!n||/^Spieler \d+$/.test(n.trim());
function rememberPlayers(){
  const keep=['nick','set','jingle','aid'];
  setup.players.slice().reverse().forEach(pl=>{
    const n=(pl.name||'').trim();if(pl.bot||isDefaultName(n)) return;
    const r={name:n};keep.forEach(k=>{if(pl[k]) r[k]=pl[k];});
    setup.regulars=[r,...setup.regulars.filter(x=>x.name!==n)];
  });
  setup.regulars=setup.regulars.slice(0,30);
}
function addRegular(name){
  const r=setup.regulars.find(x=>x.name===name);if(!r||setup.players.length>=8&&!setup.players.some(p=>!p.bot&&isDefaultName(p.name))) return;
  const i=setup.players.findIndex(p=>!p.bot&&isDefaultName(p.name));
  if(i>=0) setup.players[i]=clone(r); else setup.players.push(clone(r));
}
/* Datensicherung als JSON-Datei */
const nGames=n=>n===1?'1 Spiel':n+' Spiele';
async function backupData(){
  const data={app:'pfeilerl',format:1,version:VERSION,ts:Date.now(),records:await loadRecords(),sets:setup.sets,regulars:setup.regulars,coach:store.get('dart.coach')};
  const day=new Date().toISOString().slice(0,10);
  try{
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`pfeilerl-sicherung-${day}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    setupMsg=`Sicherung mit ${nGames(data.records.length)} gespeichert.`;setupMore=true;
  }catch(e){moreErr={where:'backup',text:'Die Sicherung ließ sich hier nicht speichern. Öffne Pfeilerl im Browser und versuch es dort.'};setupMore=true;}
  renderSetup();
}
function mergeBackup(data){
  data=untrusted(data);
  if(!data||data.app!=='pfeilerl'||!Array.isArray(data.records)) throw new Error('keine Sicherung');
  const have=new Set(localRecs().map(r=>r.id));
  const add=data.records.filter(r=>r&&r.id&&!have.has(r.id)&&MODES[r.mode]&&Array.isArray(r.players)).map(r=>Object.assign({},r,{pending:true}));
  const all=localRecs().concat(add).sort((x,y)=>x.ts-y.ts);
  store.set('dart.records',all.slice(-1000));
  let sets=0,regs=0;
  (Array.isArray(data.sets)?data.sets:[]).forEach(st=>{if(st&&/^[A-Za-z0-9_-]{1,40}$/.test(st.id)&&st.name&&!setup.sets.some(x=>x.id===st.id)){setup.sets.push(st);sets++;}});
  (Array.isArray(data.regulars)?data.regulars:[]).forEach(r=>{if(r&&r.name&&!setup.regulars.some(x=>x.name===r.name)){setup.regulars.push(r);regs++;}});
  if(data.coach&&!store.get('dart.coach')) store.set('dart.coach',data.coach);
  saveSetup();
  return {games:add.length,sets,regs};
}
async function restoreFile(file){
  if(file.size>20*1024*1024){moreErr={where:'backup',text:'Die Datei ist zu groß für eine Pfeilerl-Sicherung (höchstens 20 MB).'};setupMore=true;renderSetup();return;}
  try{
    const n=mergeBackup(JSON.parse(await file.text()));
    setupMsg=n.games+n.regs+n.sets?`Wiederhergestellt: ${nGames(n.games)}, ${n.regs} Stammspieler, ${n.sets} Dart-Sets.`:'Alles aus dieser Sicherung ist schon da.';
    loadRecords();
  }catch(e){moreErr={where:'backup',text:'Diese Datei ist keine Pfeilerl-Sicherung.'};setupMsg='';}
  setupMore=true;renderSetup();
}
const botName=lv=>'CPU '+BOTS[lv].n;
/* Computer-Gegner gleicher Stärke bekommen eine Nummer, damit Namen eindeutig bleiben */
function uniqueBotName(lv,idx){
  const taken=new Set(setup.players.filter((_,i)=>i!==idx).map(p=>(p.name||'').trim().toLowerCase()));
  let n=botName(lv),k=2;while(taken.has(n.toLowerCase())) n=botName(lv)+' '+(k++);
  return n;
}
const LOGO='<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#1F201D"/><circle cx="24" cy="24" r="18" fill="#EDE2C4"/><circle cx="24" cy="24" r="12.5" fill="#1F201D"/><circle cx="24" cy="24" r="6.5" fill="#1B7546"/><circle cx="24" cy="24" r="3" fill="#C4262C"/><path d="M25 23L44 4" stroke="#C4262C" stroke-width="2.6" stroke-linecap="round"/><path d="M40 3l5 0 0 5M37 6l5 0 0 5" fill="none" stroke="#C4262C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- Spiel ---------- */
function startGame(fromSaved,cfg){
  if(fromSaved){
    game=untrusted(saved.g);history=Array.isArray(saved.h)?saved.h.map(h=>untrusted(h)).filter(validGame):[];if(!game.gid) game.gid=newId();
    if(game.screen&&!scr) scr={code:game.screen};
    if(game.online&&!onl){const o=store.get('dart.online');if(o&&o.code===game.online){onl=o;onlRev=0;onlSubscribe();}}
    if(game.mode==='x01'){game.leg=game.leg||1;game.legStarter=game.legStarter||0;game.players.forEach(p=>{for(const k of ['v100','v140','v180','f9','f9d','coAtt','coHit','finish','visits','legs','sets','legsWon','scoredPrev','legDarts0','bestLeg']) if(typeof p[k]!=='number') p[k]=0;});}
  }
  else{
    const mode=cfg?cfg.mode:setup.mode,m=MODES[mode];
    const dup=!cfg&&dupName(setup.players);
    if(dup){setupErr=`Zwei Spieler heißen „${dup}“. Gib allen einen eigenen Namen, sonst vermischt sich die Statistik.`;renderSetup();return;}
    if(!cfg&&m.minPlayers&&setup.players.length<m.minPlayers){setupErr=`${m.name} braucht mindestens ${m.minPlayers} Spieler. Füge einen Mitspieler oder Computer hinzu.`;renderSetup();return;}
    game={gid:newId(),tour:cfg?cfg.tour||null:null,drill:cfg&&cfg.drill?cfg.drill:null,mode,opts:clone(cfg?cfg.opts:setup.opts[mode]),players:cfg?clone(cfg.players):setup.players.map((pl,i)=>({name:(pl.name||'').trim()||'Spieler '+(i+1),bot:pl.bot||0,nick:pl.nick||'',jingle:pl.jingle||(pl.bot?'robot':'fanfare'),aid:pl.aid||'',set:pl.set?setLabel(pl.set):''})),cur:0,round:1,visit:[],locked:false,bust:false,winner:null,msg:''};
    m.init(game);history=[];saveGame();
    if(!cfg){setup.recent=[mode,...setup.recent.filter(k=>k!==mode)].slice(0,4);rememberPlayers();setupMsg='';saveSetup();}
  }
  setupErr='';quitArmed=false;camWake();
  const m=MODES[game.mode];
  app.innerHTML=`<div class="wrap game">
  <header class="gbar"><div><h1 class="gmode">${m.name}</h1><div class="gsub">${esc(m.sub(game.opts))}${game.online?` <b class="code">Online ${esc(game.online)}</b>`:''}${game.screen?` <b class="code">Bildschirm ${esc(game.screen)}</b>`:''}</div></div><div class="gtools"><button class="ghost" id="tvbtn" aria-label="Großer Bildschirm">📺</button><button class="ghost" id="voice"></button><button class="ghost" id="quit">Beenden</button></div></header>
  <div id="score"></div>
  <div class="turn"><div class="hint" id="hint" aria-live="polite"></div><div class="visit" id="visit"></div></div>
  <p class="camline" id="camstat"${cam.active?'':' hidden'}>${esc(cam.last||'Kamera aktiv')}</p>
  <div class="pad" id="pad"><div class="mods"><button id="mD" class="mod" aria-pressed="false">Double</button><button id="mT" class="mod" aria-pressed="false">Triple</button></div><div class="keys">${Array.from({length:20},(_,i)=>`<button class="key" data-n="${i+1}">${i+1}</button>`).join('')}<button class="key k25" data-n="25">25</button><button class="key kb" data-n="50">Bull</button></div></div>
  <nav class="controls"><button class="sec" id="undo">Rückgängig</button><button class="sec" id="miss">Daneben</button><button class="primary" id="next">Weiter</button><p class="kbhelp">Tastatur: Zahl tippen, <kbd>D</kbd> Double, <kbd>T</kbd> Triple, <kbd>B</kbd> Bull, <kbd>0</kbd> Daneben, <kbd>Enter</kbd> Weiter, <kbd>⌫</kbd> Rückgängig</p></nav>
  <div id="ov"></div></div>`;
  document.getElementById('pad').addEventListener('click',e=>{
    const t=e.target.closest('button');if(!t||t.disabled) return;
    if(t.id==='mD'||t.id==='mT'){const v=t.id==='mD'?2:3;setMod(mod===v?1:v);return;}
    const n=+t.dataset.n;if(!n) return;
    const d=n===50?{seg:25,mult:2}:n===25?{seg:25,mult:mod===2?2:1}:{seg:n,mult:mod};
    setMod(1);throwDart(d);
  });
  setMod(1);
  document.getElementById('undo').onclick=undo;
  document.getElementById('miss').onclick=()=>throwDart({seg:0,mult:0});
  document.getElementById('next').onclick=()=>nextVisit(false);
  document.getElementById('quit').onclick=quit;
  document.getElementById('tvbtn').onclick=tvButton;
  document.getElementById('voice').onclick=()=>{setup.voice=!setup.voice;saveSetup();voiceBtn();if(setup.voice) say(promptCall(game)||'Ansage an');else if(window.speechSynthesis) speechSynthesis.cancel();};
  voiceBtn();keepAwake();update();
  if(!fromSaved){if(setup.walkon&&!scr) playIntro(game.players).then(()=>say(promptCall(game)));else say(promptCall(game));}
}
function voiceBtn(){const b=document.getElementById('voice');if(!b) return;b.textContent=setup.voice?'🔊':'🔇';b.setAttribute('aria-label',setup.voice?'Ansage ausschalten':'Ansage einschalten');}
function setMod(m){
  mod=m;
  const D=document.getElementById('mD'),T=document.getElementById('mT');if(!D) return;
  D.classList.toggle('on',m===2);D.setAttribute('aria-pressed',m===2);
  T.classList.toggle('on',m===3);T.setAttribute('aria-pressed',m===3);
  document.querySelectorAll('#pad .k25,#pad .kb').forEach(k=>k.disabled=m===3);
}

function throwDart(d,fromBot){
  if(!game||game.winner) return;
  camTouch();
  if(isBotTurn()&&!fromBot) return;
  if(!fromBot&&!canAct()) return;
  if(game.locked||game.legDone){pulseNext();return;}
  history.push(clone(game));
  const p=game.players[game.cur];
  game.visit.push(d);
  p.hm=p.hm||{};const k=hitKey(d);p.hm[k]=(p.hm[k]||0)+1;
  MODES[game.mode].dart(game,p,d);
  if(game.visit.length>=3&&!game.winner) game.locked=true;
  if(game.winner) onFinish();
  if(game.winner||game.locked){game.called=true;say(game.winner?[MODES[game.mode].scoreCall&&!game.legDone?visitCall(game,p):'',winCall(game)].filter(Boolean).join('. '):visitCall(game,p));}
  if(!fromBot&&navigator.vibrate) try{navigator.vibrate(12)}catch(e){}
  saveGame();update();
}

function advance(g){
  const n=g.players.length;let c=g.cur;
  for(let k=1;k<=n;k++){const x=(g.cur+k)%n;if(!g.players[x].out){c=x;break;}}
  const wrapped=c<=g.cur;g.cur=c;if(wrapped) g.round++;
  return wrapped;
}

function nextVisit(fromBot){
  if(!game||game.winner) return;
  if(isBotTurn()&&!fromBot) return;
  if(!fromBot&&!canAct()) return;
  history.push(clone(game));
  game.flash='';
  const m=MODES[game.mode];
  if(m.beforeNext&&m.beforeNext(game)){
    game.visit=[];game.locked=false;game.bust=false;game.called=false;
    saveGame();update();say(promptCall(game));return;
  }
  const p=game.players[game.cur];
  while(game.visit.length<3&&!game.locked&&!game.winner){const d={seg:0,mult:0};game.visit.push(d);m.dart(game,p,d);}
  const pre=game.called?'':visitCall(game,p);
  if(m.endVisit) m.endVisit(game,p);
  game.visit=[];game.locked=false;game.bust=false;game.called=false;game.msg='';
  if(m.afterVisit) m.afterVisit(game);
  if(!game.winner){
    if(m.keepTurn&&m.keepTurn(game,p)){if(m.startVisit) m.startVisit(game,p);}
    else{
      const w=advance(game);
      if(w&&m.onRound) m.onRound(game);
      if(!game.winner&&m.startVisit) m.startVisit(game,game.players[game.cur]);
    }
  }
  if(game.winner) onFinish();
  saveGame();update();
  say([pre,game.flash,game.winner?winCall(game):promptCall(game)].filter(Boolean).join('. '));
}

function undo(){
  if(!history.length) return;
  clearTimeout(botTimer);botTimer=null;
  const was=!!game.winner,gid=game.gid;
  game=history.pop();
  while(history.length&&game.players[game.cur].bot&&!game.winner&&game.players.some(p=>!p.bot)) game=history.pop();
  if(was&&!game.winner){deleteRecord(gid);revertTour(game);drillDone(game,true);}
  if(window.speechSynthesis) try{speechSynthesis.cancel()}catch(e){}
  saveGame();update();
}

let confettiGid='';
function confetti(key){
  if(!key||confettiGid===key) return;confettiGid=key;
  try{if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches) return;}catch(e){}
  const box=document.createElement('div');box.className='confetti';box.setAttribute('aria-hidden','true');
  const cols=['#FF3D68','#FFC23C','#7B5CFF','#2F9BFF','#00A88F','#FF8A3D'];
  for(let i=0;i<90;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.background=cols[i%cols.length];p.style.animationDuration=(2.2+Math.random()*1.8)+'s';p.style.animationDelay=(Math.random()*0.6)+'s';p.style.transform='rotate('+Math.random()*360+'deg)';box.appendChild(p);}
  document.body.appendChild(box);setTimeout(()=>box.remove(),5000);
}
function scheduleBot(){
  clearTimeout(botTimer);botTimer=null;
  if(!isBotTurn()||(onl&&!onl.host)) return;
  if(intro.running){botTimer=setTimeout(scheduleBot,600);return;}
  const fin=game.locked||game.legDone;
  botTimer=setTimeout(()=>{
    botTimer=null;
    if(!isBotTurn()) return;
    if(game.locked||game.legDone) nextVisit(true);
    else throwDart(botThrow(game,game.players[game.cur]),true);
  },fin?1500:750);
}

/* Tastatur am PC: Zahl tippen (1, 2 und 5 warten kurz auf eine zweite Ziffer), D/T, B, 0, Enter, Rücktaste */
let kbBuf='',kbTimer=null;
const kbValid=n=>(n>=1&&n<=20)||n===25||n===50;
function kbShow(){document.querySelectorAll('#pad .key').forEach(k=>k.classList.toggle('kbd',!!kbBuf&&k.dataset.n===kbBuf));}
function kbThrow(n){
  if(n===25&&mod===3){setMod(1);return;}
  const d=n===50?{seg:25,mult:2}:n===25?{seg:25,mult:mod===2?2:1}:{seg:n,mult:mod};
  setMod(1);throwDart(d);
}
function kbFlush(){clearTimeout(kbTimer);kbTimer=null;const n=+kbBuf;kbBuf='';kbShow();if(kbValid(n)) kbThrow(n);}
function gameKey(e){
  if(!game||game.winner){kbBuf='';return;}
  const k=e.key,t=e.target||{};
  if(e.altKey||e.metaKey||(e.ctrlKey&&k!=='z')) return;
  if(['INPUT','TEXTAREA','SELECT'].includes(t.tagName)) return;
  if((k==='Enter'||k===' ')&&t.closest&&t.closest('.gtools')) return;
  if(/^[0-9]$/.test(k)){
    if(!kbBuf&&k==='0') throwDart({seg:0,mult:0});
    else{
      kbBuf+=k;const n=+kbBuf;
      const more=kbBuf.length<2&&Array.from({length:10},(_,i)=>n*10+i).some(kbValid);
      if(more){clearTimeout(kbTimer);kbTimer=setTimeout(kbFlush,700);kbShow();} else kbFlush();
    }
  }
  else if(k==='d'||k==='D') setMod(mod===2?1:2);
  else if(k==='t'||k==='T') setMod(mod===3?1:3);
  else if(k==='b'||k==='B') kbThrow(50);
  else if(k==='Enter'||k===' '){if(kbBuf) kbFlush(); else nextVisit(false);}
  else if(k==='Backspace'||k==='z'){if(kbBuf){clearTimeout(kbTimer);kbBuf='';kbShow();} else undo();}
  else if(k==='Escape'){clearTimeout(kbTimer);kbBuf='';kbShow();setMod(1);}
  else return;
  e.preventDefault();
}
document.addEventListener('keydown',gameKey);

function pulseNext(){const n=document.getElementById('next');if(!n) return;n.classList.remove('pulse');void n.offsetWidth;n.classList.add('pulse');}

function quit(){
  const q=document.getElementById('quit');
  if(!quitArmed&&!game.winner){quitArmed=true;q.textContent='Wirklich?';q.classList.add('warn');
    setTimeout(()=>{if(quitArmed&&q.isConnected){quitArmed=false;q.textContent='Beenden';q.classList.remove('warn');}},3000);return;}
  endGame();
}
function endGame(toT){
  onlLeave();scr=null;
  clearTimeout(botTimer);botTimer=null;
  if(window.speechSynthesis) try{speechSynthesis.cancel()}catch(e){}
  store.del('dart.game');game=null;history=[];
  if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}
  if(toT===true) renderTour(); else if(toT==='coach') openCoach(); else renderSetup();
  window.scrollTo(0,0);
}

function update(){
  const m=MODES[game.mode],p=game.players[game.cur],bot=isBotTurn(),wait=!bot&&!canAct();
  const sc=document.getElementById('score');sc.innerHTML=m.board(game);sc.classList.toggle('many',game.players.length>2);
  let h='';
  if(game.winner) h='<span class="who">Spiel vorbei</span>';
  else if(game.legDone) h=`<span class="who">${esc(game.msg)}</span><span class="co">Weiter startet das nächste Leg</span>`;
  else if(game.bust) h=`<span class="who">${esc(p.name)}</span><span class="warn">Überworfen, zurück auf ${game.mode==='ct'?p.rem:p.score}</span>`;
  else if(bot) h=`<span class="who">${esc(p.name)} wirft</span><span class="co">Computer ist am Zug</span>`;
  else if(wait) h=`<span class="who">${esc(p.name)} ist dran</span><span class="co">Online, warte auf den Wurf</span>`;
  else if(game.locked) h=`<span class="who">${game.mode==='ct'&&p.done?'Geschafft! ':''}Darts ziehen, dann Weiter</span>`;
  else{const t=m.hint(game,p);h=`<span class="who">${esc(p.name)} wirft</span>${t?`<span class="co">${esc(t)}</span>`:''}${game.msg?`<span class="co">${esc(game.msg)}</span>`:''}${game.flash?`<span class="co">${esc(game.flash)}</span>`:''}`;}
  document.getElementById('hint').innerHTML=h;
  let v='';
  for(let i=0;i<3;i++){const d=game.visit[i];v+=d?`<div class="slot f ${d.mult===3?'t':d.mult===2?'d':''}">${label(d)}</div>`:'<div class="slot"></div>';}
  v+=`<div class="vsum">${game.visit.length?game.visit.reduce((a,d)=>a+val(d),0):''}</div>`;
  document.getElementById('visit').innerHTML=v;
  const tg=m.targets?m.targets(game):null;
  document.querySelectorAll('#pad .key').forEach(k=>{const n=+k.dataset.n;k.classList.toggle('dim',!!tg&&!tg.includes(n===50?25:n));});
  document.getElementById('pad').classList.toggle('busy',bot||wait);
  const n=document.getElementById('next');
  const nxt=game.players[(game.cur+1)%game.players.length].name;
  n.textContent=game.legDone?'Nächstes Leg':game.locked&&game.players.length>1&&!(m.keepTurn&&m.keepTurn(game,p)&&!(p.done||p.used>=game.opts.darts))?'Weiter zu '+nxt:'Weiter';
  n.classList.toggle('idle',!(game.locked||game.legDone));
  n.disabled=bot||wait;
  document.getElementById('undo').disabled=!history.length;
  document.getElementById('miss').disabled=!!(game.locked||game.winner||game.legDone||bot||wait);
  const ov=document.getElementById('ov');
  document.querySelectorAll('.wrap.game > :not(#ov)').forEach(el=>{el.inert=!!game.winner;});
  if(game.winner){
    const names=game.winner.map(i=>esc(game.players[i].name));
    const na=newAchievements(game),multi=game.players.filter(p=>!p.bot).length>1;
    const achHTML=na.length?`<div class="ovach"><b>Neu freigeschaltet</b>${na.map(x=>`<span>★ ${esc(x[1])}${multi?' ('+esc(x[0])+')':''}</span>`).join('')}</div>`:'';
    ov.innerHTML=`<div class="ov" role="dialog" aria-modal="true" aria-labelledby="ovh"><div class="ovcard">
      <p class="ovk">${esc(game.msg||'Spiel vorbei')}</p>
      <h2 id="ovh" class="cond">${names.length>1?'Unentschieden: '+names.join(' und '):names[0]+' gewinnt'}</h2>
      <ul class="stats">${m.stats(game).map(s=>`<li><span>${esc(s[0])}</span><span>${esc(s[1])}</span></li>`).join('')}</ul>
      ${achHTML}<div class="ovbtns">${game.drill?'<button class="primary" id="again">Zurück zum Trainer</button>':game.tour?'<button class="primary" id="again">Zum Turnier</button>':'<button class="primary" id="again">Revanche</button><button class="ghost" id="newg">Neues Spiel</button>'}<button class="ghost" id="undo2">Letzten Wurf zurücknehmen</button></div></div></div>`;
    document.getElementById('again').onclick=game.drill?toCoach:game.tour?toTour:rematch;
    if(!game.tour&&!game.drill) document.getElementById('newg').onclick=endGame;
    document.getElementById('undo2').onclick=undo;
    document.getElementById('again').focus();
    confetti(game.gid+':'+game.winner.join(','));
  } else ov.innerHTML='';
  scheduleBot();
}

function rematch(){
  const old=setup.players;
  const pl=game.players.map(p=>{const o=old.find(x=>(x.name||'').trim()===p.name);return o?Object.assign({},o):{name:p.name,bot:p.bot||0};});
  pl.push(pl.shift());
  const scode=game.screen;
  const code=game.online;
  setup.mode=game.mode;setup.opts[game.mode]=clone(game.opts);setup.players=pl;saveSetup();
  startGame(false);
  if(code&&onl){game.online=code;saveGame();update();}
  if(scode&&scr){game.screen=scode;saveGame();update();}
}

async function keepAwake(){
  try{if('wakeLock' in navigator&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}}catch(e){wakeLock=null;}
}
document.addEventListener('visibilitychange',()=>{if(game&&document.visibilityState==='visible') keepAwake();});

/* ---------- Statistik ---------- */
let dbCol=null,dbNs=null;
function getDbNs(){
  if(!dbNs) dbNs=(async()=>{try{
    if(!window.claude||typeof window.claude.use!=='function') return null;
    return await window.claude.use('db');
  }catch(e){return null;}})();
  return dbNs;
}
function getCol(){
  if(!dbCol) dbCol=(async()=>{try{
    const db=await getDbNs();if(!db) return null;
    const u=await window.claude.use('user');const uid=u?await u.id():null;if(!uid) return null;
    return db.collection('data/users/'+uid+'/games');
  }catch(e){return null;}})();
  return dbCol;
}
const localRecs=()=>store.get('dart.records')||[];
function putLocal(rec){const a=localRecs().filter(r=>r.id!==rec.id);a.push(rec);a.sort((x,y)=>x.ts-y.ts);store.set('dart.records',a.slice(-1000));}
async function saveRecord(rec){
  rec.pending=true;putLocal(rec);
  const col=await getCol();if(!col) return;
  try{const r=clone(rec);delete r.pending;await col.doc(rec.id).set(r);rec.pending=false;putLocal(rec);}catch(e){}
}
async function deleteRecord(id){
  store.set('dart.records',localRecs().filter(r=>r.id!==id));
  const col=await getCol();if(!col) return;
  try{await col.doc(id).delete();}catch(e){}
}
async function loadRecords(){
  const local=localRecs();
  const col=await getCol();
  if(!col) return local.map(r=>untrusted(r));
  try{
    const snap=await col.orderBy('ts','desc').limit(1000).get();
    const map=new Map();
    snap.docs.forEach(d=>{if(d.exists) map.set(d.id,untrusted(Object.assign({},d.data(),{id:d.id})));});
    for(const r of local){
      if(r.pending&&!map.has(r.id)){
        const c=clone(r);delete c.pending;
        try{await col.doc(r.id).set(c);map.set(r.id,c);}catch(e){map.set(r.id,r);}
      }
    }
    const all=[...map.values()].sort((a,b)=>a.ts-b.ts);
    store.set('dart.records',all.slice(-1000));
    return all;
  }catch(e){return local.map(r=>untrusted(r));}
}
function buildRecord(g){
  const m=MODES[g.mode];
  return {id:g.gid,ts:Date.now(),mode:g.mode,opts:clone(g.opts),
    players:g.players.map((p,i)=>Object.assign({name:p.name,bot:p.bot||0,won:g.winner.includes(i),darts:p.darts||0,hm:p.hm||{},set:p.set||''},m.record(g,p)))};
}
const sv={open:false,mode:'x01',player:null,recs:[],armed:null};
async function renderStats(){
  sv.open=true;sv.mode='profil';sv.armed=null;
  app.innerHTML='<div class="wrap"><header class="gbar"><h1 class="gmode">Statistik</h1><button class="ghost" data-act="back">Zurück</button></header><p class="muted">Statistik wird geladen …</p></div>';
  window.scrollTo(0,0);
  const recs=await loadRecords();
  if(!sv.open||game) return;
  sv.recs=recs;drawStats();
}
function agg(es,mode){
  const n=es.length,sum=k=>es.reduce((a,e)=>a+(e[k]||0),0),max=k=>es.reduce((a,e)=>Math.max(a,e[k]||0),0);
  const r={n,w:es.filter(e=>e.won).length};r.pct=n?r.w/n*100:0;
  if(mode==='x01'){
    const d=sum('darts'),f=sum('f9d'),ca=sum('coAtt'),ga=e=>e.darts?e.scored/e.darts*3:0;
    Object.assign(r,{avg:d?sum('scored')/d*3:0,bestAvg:es.reduce((a,e)=>Math.max(a,ga(e)),0),f9:f?sum('f9')/f*3:0,best:max('best'),co:max('checkout'),coq:ca?sum('coHit')/ca*100:null,v100:sum('v100'),v140:sum('v140'),v180:sum('v180'),trend:es.map(ga)});
    r.main=r.avg;
  }else if(mode==='cricket'){
    const d=sum('darts'),gm=e=>e.darts?e.marks/(e.darts/3):0;
    Object.assign(r,{mpr:d?sum('marks')/(d/3):0,bestMpr:es.reduce((a,e)=>Math.max(a,gm(e)),0),pts:n?sum('points')/n:0,trend:es.map(gm)});
    r.main=r.mpr;
  }else if(mode==='atc'){
    const fin=es.filter(e=>e.done),d=sum('darts');
    Object.assign(r,{bestD:fin.length?Math.min(...fin.map(e=>e.darts)):null,rate:d?sum('hits')/d*100:0,trend:es.map(e=>e.darts?e.hits/e.darts*100:0)});
    r.main=r.bestD;
  }else if(mode==='killer'){
    Object.assign(r,{kills:sum('kills'),avgK:n?sum('kills')/n:0,trend:es.map(e=>e.kills||0)});
    r.main=r.pct;
  }else if(mode==='bobs'){
    const d=sum('darts');
    Object.assign(r,{bestS:es.reduce((a,e)=>Math.max(a,e.score??-Infinity),-Infinity),avgS:n?sum('score')/n:0,dq:d?sum('hits')/d*100:0,trend:es.map(e=>e.score||0)});
    r.main=r.bestS;
  }else if(mode==='ct'){
    const at=sum('att');
    Object.assign(r,{q:at?sum('ok')/at*100:0,okT:sum('ok'),bestQ:es.reduce((a,e)=>Math.max(a,e.att?e.ok/e.att*100:0),0),trend:es.map(e=>e.att?e.ok/e.att*100:0)});
    r.main=r.q;
  }else if(MODES[mode]&&MODES[mode].statKind){
    const k=MODES[mode].statKind,d=sum('darts');
    if(k==='low'){const v=es.map(e=>e.score||0);Object.assign(r,{best:n?Math.min(...v):null,avgS:n?sum('score')/n:0,trend:v});r.main=r.best;}
    else if(k==='darts'){const fin=es.filter(e=>e.done);Object.assign(r,{bestD:fin.length?Math.min(...fin.map(e=>e.darts)):null,rate:d?sum('hits')/d*100:0,trend:es.map(e=>e.darts?e.hits/e.darts*100:0)});r.main=r.bestD;}
    else if(k==='top'){const at=sum('att');Object.assign(r,{best:max('best'),q:at?sum('ok')/at*100:0,trend:es.map(e=>e.best||0)});r.main=r.best;}
    else if(k==='avg'){Object.assign(r,{avg:d?sum('score')/d*3:0,bestS:max('score'),best:max('best'),ton:sum('ton'),trend:es.map(e=>e.darts?e.score/e.darts*3:0)});r.main=r.avg;}
    else{Object.assign(r,{trend:es.map(e=>e.won?1:0)});r.main=r.pct;}
  }else{
    Object.assign(r,{bestS:max('score'),avgS:n?sum('score')/n:0,trend:es.map(e=>e.score||0)});
    r.main=r.bestS;
  }
  return r;
}
function detail(a){
  const L=[[a.n,'Spiele'],[a.w,'Siege'],[Math.round(a.pct)+' %','Siegquote']];
  const md=sv.mode;
  if(md==='x01') L.push([fmt(a.avg),'3-Dart-Average'],[fmt(a.f9),'First 9'],[fmt(a.bestAvg),'Bestes Spiel Ø'],[a.best,'Höchste Aufnahme'],[a.co||'–','Höchstes Finish'],[a.coq==null?'–':Math.round(a.coq)+' %','Doppelquote'],[a.v100,'100 bis 139'],[a.v140,'140 bis 179'],[a.v180,'180er']);
  else if(md==='cricket') L.push([fmt(a.mpr),'Marks pro Runde'],[fmt(a.bestMpr),'Beste MPR'],[fmt(a.pts),'Ø Punkte']);
  else if(md==='atc') L.push([a.bestD==null?'–':a.bestD,'Wenigste Darts'],[Math.round(a.rate)+' %','Trefferquote']);
  else if(md==='killer') L.push([a.kills,'Abschüsse'],[fmt(a.avgK),'Ø Abschüsse']);
  else if(md==='bobs') L.push([a.bestS,'Höchste Punktzahl'],[fmt(a.avgS),'Ø Punkte'],[Math.round(a.dq)+' %','Doppelquote']);
  else if(md==='ct') L.push([Math.round(a.q)+' %','Erfolgsquote'],[a.okT,'Finishes geschafft'],[Math.round(a.bestQ)+' %','Beste Einheit']);
  else if(MODES[md].statKind){
    const k=MODES[md].statKind;
    if(k==='low') L.push([a.best==null?'–':a.best,'Bestes Ergebnis'],[fmt(a.avgS),'Ø Ergebnis']);
    else if(k==='darts') L.push([a.bestD==null?'–':a.bestD,'Wenigste Darts'],[Math.round(a.rate)+' %','Trefferquote']);
    else if(k==='top') L.push([a.best||'–','Höchstes Finish'],[Math.round(a.q)+' %','Erfolgsquote']);
    else if(k==='avg') L.push([fmt(a.avg),'3-Dart-Average'],[a.bestS,'Beste Einheit'],[a.best,'Höchste Aufnahme'],[a.ton,'Aufnahmen 100+']);
  }
  else L.push([a.bestS,'Höchste Punktzahl'],[fmt(a.avgS),'Ø Punkte']);
  return L.map(x=>`<div class="sv"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
}
const TCAP={x01:'3-Dart-Average',cricket:'Marks pro Runde',atc:'Trefferquote',shanghai:'Punkte',killer:'Abschüsse',bobs:'Punkte',ct:'Erfolgsquote'};
function trendSVG(t){
  t=t.slice(-20);if(t.length<2) return '';
  const W=320,H=100,P=8,mn=Math.min(0,...t),mx=Math.max(...t)*1.15||1,rg=(mx-mn)||1;
  const pts=t.map((v,i)=>[P+i*(W-2*P)/(t.length-1),H-P-(v-mn)/rg*(H-2*P)]);
  const cap=TCAP[sv.mode]||({low:'Ergebnis',darts:'Trefferquote',top:'Bestes Finish',avg:'3-Dart-Average',wins:'Siege'})[(MODES[sv.mode]||{}).statKind]||'Punkte';
  return `<figure class="trend"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${cap} der letzten ${t.length} Spiele"><polyline points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--green)"/>`).join('')}</svg><figcaption>${cap} der letzten ${t.length} Spiele</figcaption></figure>`;
}
function heatSVG(es){
  const hm={};es.forEach(e=>{for(const k in (e.hm||{})) hm[k]=(hm[k]||0)+e.hm[k];});
  const total=Object.values(hm).reduce((a,b)=>a+b,0);
  if(!total) return '';
  const max=Math.max(...Object.entries(hm).filter(([k])=>k!=='0').map(([,v])=>v),1);
  const pol=(r,a)=>{const t=(a-90)*Math.PI/180;return (r*Math.cos(t)).toFixed(2)+' '+(r*Math.sin(t)).toFixed(2);};
  const sec=(r1,r2,a0,a1)=>`M${pol(r2,a0)}A${r2} ${r2} 0 0 1 ${pol(r2,a1)}L${pol(r1,a1)}A${r1} ${r1} 0 0 0 ${pol(r1,a0)}Z`;
  const op=k=>hm[k]?(0.12+0.88*hm[k]/max).toFixed(2):0;
  const bed=(d,k)=>`<path d="${d}" fill="var(--surface)" stroke="var(--line)" stroke-width=".6"/>${hm[k]?`<path d="${d}" fill="var(--red)" fill-opacity="${op(k)}"/>`:''}`;
  let s='<svg viewBox="-104 -104 208 208" role="img" aria-label="Trefferbild">';
  SEGS.forEach((seg,i)=>{
    const a0=i*18-9,a1=i*18+9;
    s+=bed(sec(13,47,a0,a1),'S'+seg)+bed(sec(47,58,a0,a1),'T'+seg)+bed(sec(58,78,a0,a1),'S'+seg)+bed(sec(78,88,a0,a1),'D'+seg);
    const p=pol(96,i*18).split(' ');
    s+=`<text x="${p[0]}" y="${p[1]}" text-anchor="middle" dominant-baseline="central" font-size="9" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="600" fill="var(--muted)">${seg}</text>`;
  });
  s+=`<circle r="13" fill="var(--surface)" stroke="var(--line)" stroke-width=".6"/>${hm['25']?`<circle r="13" fill="var(--red)" fill-opacity="${op('25')}"/>`:''}<circle r="6" fill="var(--surface)" stroke="var(--line)" stroke-width=".6"/>${hm['50']?`<circle r="6" fill="var(--red)" fill-opacity="${op('50')}"/>`:''}</svg>`;
  const tops=Object.entries(hm).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`<span><b>${keyLabel(k)}</b>${Math.round(v/total*100)} %</span>`).join('');
  return `<figure class="heat">${s}<div class="tops">${tops}</div><figcaption>Trefferbild aus ${total} Darts, je dunkler, desto öfter getroffen</figcaption></figure>`;
}
function gameRow(r){
  const dt=new Date(r.ts);
  const d=dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})+', '+dt.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  const ps=r.players.map(p=>p.won?`<b>${esc(p.name)}</b>`:esc(p.name)).join(', ');
  const armed=sv.armed===r.id;
  return `<li><div><span class="gd">${d}</span><span class="gs">${esc(MODES[r.mode].sub(r.opts))}</span><span>${ps}</span></div><button class="icon ${armed?'armed':''}" data-del="${esc(r.id)}" aria-label="Spiel löschen">${armed?'Löschen?':'✕'}</button></li>`;
}
function drawStats(){
  if(sv.mode==='profil'){drawProfile();return;}
  const recs=sv.recs.filter(r=>r.mode===sv.mode&&MODES[r.mode]&&Array.isArray(r.players));
  const by=new Map();
  recs.forEach(r=>r.players.forEach(p=>{if(!by.has(p.name)) by.set(p.name,[]);by.get(p.name).push(p);}));
  const names=[...by.keys()].sort((a,b)=>by.get(b).length-by.get(a).length);
  if(!names.includes(sv.player)) sv.player=names[0]||null;
  const md=sv.mode;
  const sk=(MODES[md]||{}).statKind;
  const mainLabel={x01:'Ø',cricket:'MPR',atc:'Bestwert',shanghai:'Bestwert',killer:'Quote',bobs:'Bestwert',ct:'Quote'}[md]||(sk==='wins'?'Quote':sk==='avg'?'Ø':'Bestwert');
  const mainFmt=v=>v==null||v===-Infinity?'–':(md==='atc'||sk==='darts')?v+' D':(md==='killer'||md==='ct'||sk==='wins')?Math.round(v)+' %':(md==='x01'||md==='cricket'||sk==='avg')?fmt(v):v;
  const tabs=statTabs();
  let body;
  if(!recs.length) body=`<p class="empty">Noch keine beendeten Spiele in ${MODES[md].name}. Sobald ein Spiel einen Sieger hat, erscheint es hier.</p>`;
  else{
    const rows=names.map(nm=>{const a=agg(by.get(nm),md);return `<tr class="${nm===sv.player?'sel':''}"><th><button data-splayer="${esc(nm)}">${esc(nm)}</button></th><td>${a.n}</td><td>${a.w}</td><td>${Math.round(a.pct)} %</td><td>${mainFmt(a.main)}</td></tr>`;}).join('');
    const es=by.get(sv.player),a=agg(es,md);
    body=`<section><h2>Rangliste</h2><div class="tw"><table class="rank"><thead><tr><th>Spieler</th><th>Spiele</th><th>Siege</th><th>Quote</th><th>${mainLabel}</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section><h2>${esc(sv.player)}</h2><div class="sgrid">${detail(a)}</div>${trendSVG(a.trend)}${heatSVG(es)}</section>
    <section><h2>Letzte Spiele</h2><ul class="games">${recs.slice().reverse().slice(0,20).map(gameRow).join('')}</ul></section>`;
  }
  app.innerHTML=`<div class="wrap"><header class="gbar"><h1 class="gmode">Statistik</h1><button class="ghost" data-act="back">Zurück</button></header>${tabs}${body}</div>`;
}
function statsClick(t){
  const a=t.dataset.act;
  if(a==='stats'){renderStats();return;}
  if(a==='back'){if(coach.ctl) coach.ctl.abort();tvLeave();sv.open=false;cam.calSlot=-1;cam.calPts=[];onlView.step='menu';renderSetup();window.scrollTo(0,0);return;}
  if(t.dataset.smode){sv.mode=t.dataset.smode;sv.armed=null;drawStats();return;}
  if(t.dataset.splayer!==undefined){sv.player=t.dataset.splayer;drawStats();return;}
  if(t.dataset.train!==undefined){const tp=(sv.tips||[])[+t.dataset.train];if(tp){setup.mode=tp.mode;setup.opts[tp.mode]=Object.assign({},setup.opts[tp.mode],tp.opts);saveSetup();}sv.open=false;renderSetup();window.scrollTo(0,0);return;}
  if(t.dataset.del){
    const id=t.dataset.del;
    if(sv.armed!==id){sv.armed=id;drawStats();return;}
    sv.armed=null;sv.recs=sv.recs.filter(r=>r.id!==id);deleteRecord(id);drawStats();
  }
}

/* ---------- Erfolge & Trainingsplan ---------- */
const X=es=>es.filter(e=>e.mode==='x01');
const gavg=e=>e.darts?e.scored/e.darts*3:0;
const sumOf=(es,k)=>es.reduce((s,e)=>s+(e[k]||0),0);
const ACH=[
  {n:'Erster Sieg',d:'Ein Spiel gewinnen',t:es=>es.some(e=>e.won)},
  {n:'Stammgast',d:'50 Spiele beenden',goal:50,c:es=>es.length},
  {n:'Siegertyp',d:'25 Spiele gewinnen',goal:25,c:es=>es.filter(e=>e.won).length},
  {n:'Ton',d:'Aufnahme mit 100 oder mehr',t:es=>X(es).some(e=>(e.v100||0)+(e.v140||0)+(e.v180||0)>0)},
  {n:'Ton-Vierzig',d:'Aufnahme mit 140 oder mehr',t:es=>X(es).some(e=>(e.v140||0)+(e.v180||0)>0)},
  {n:'Einhundertachtzig',d:'Eine 180 werfen',t:es=>X(es).some(e=>(e.v180||0)>0)},
  {n:'Maximum-Sammler',d:'Insgesamt 10 × 180',goal:10,c:es=>sumOf(X(es),'v180')},
  {n:'High Finish',d:'Checkout ab 100',t:es=>X(es).some(e=>(e.checkout||0)>=100)},
  {n:'Big Fish',d:'170 auschecken',t:es=>X(es).some(e=>e.checkout===170)},
  {n:'Solide',d:'X01-Spiel mit Ø 60 oder mehr',t:es=>X(es).some(e=>e.darts>=9&&gavg(e)>=60)},
  {n:'Stark',d:'X01-Spiel mit Ø 80 oder mehr',t:es=>X(es).some(e=>e.darts>=9&&gavg(e)>=80)},
  {n:'Flottes Leg',d:'501 in 15 Darts oder weniger',t:es=>X(es).some(e=>e.start===501&&e.bestLeg>0&&e.bestLeg<=15)},
  {n:'Neun-Darter',d:'501 in 9 Darts',t:es=>X(es).some(e=>e.start===501&&e.bestLeg===9)},
  {n:'Cricket-Ass',d:'Cricket mit 3 Marks pro Runde',t:es=>es.some(e=>e.mode==='cricket'&&e.darts>=9&&e.marks/(e.darts/3)>=3)},
  {n:'Uhrwerk',d:'Rund um die Uhr in 30 Darts',t:es=>es.some(e=>e.mode==='atc'&&e.done&&e.darts<=30)},
  {n:'Shanghai!',d:'Single, Double und Triple in einer Aufnahme',t:es=>es.some(e=>e.shanghai)},
  {n:'Doppel-Meister',d:"Bob's 27 mit 100 Punkten oder mehr",t:es=>es.some(e=>e.mode==='bobs'&&e.score>=100)},
  {n:'Perfektes Training',d:'Checkout-Training ohne Fehlversuch, ab 5 Finishes',t:es=>es.some(e=>e.mode==='ct'&&e.att>=5&&e.ok===e.att)},
  {n:'Serienkiller',d:'3 Abschüsse in einem Killer-Spiel',t:es=>es.some(e=>e.mode==='killer'&&e.kills>=3)},
  {n:'Profi-Bezwinger',d:'Gegen CPU Profi gewinnen',t:es=>es.some(e=>e.beatPro)}
];
const achDone=(a,es)=>a.t?a.t(es):a.c(es)>=a.goal;
function entriesFor(recs,name){
  return recs.filter(r=>Array.isArray(r.players)).flatMap(r=>r.players.filter(p=>p.name===name).map(p=>
    Object.assign({mode:r.mode,start:r.opts?r.opts.start:0,beatPro:!!p.won&&r.players.some(q=>q!==p&&q.bot===4)},p)));
}
function newAchievements(g){
  const recs=localRecs(),cur=recs.find(r=>r.id===g.gid);
  if(!cur) return [];
  const before=recs.filter(r=>r.id!==cur.id),out=[];
  cur.players.filter(p=>!p.bot).forEach(p=>{
    const all=entriesFor(recs,p.name),old=entriesFor(before,p.name);
    ACH.forEach(a=>{if(achDone(a,all)&&!achDone(a,old)) out.push([p.name,a.n]);});
  });
  return out;
}
function statTabs(){
  const opt=(k,n)=>`<option value="${k}" ${sv.mode===k?'selected':''}>${esc(n)}</option>`;
  return `<label class="selwrap"><span class="olabel">Bereich</span><select id="smode">${opt('profil','Profil: Erfolge und Training')}${CATS.map(([c,cn])=>`<optgroup label="${cn}">${Object.entries(MODES).filter(([,m])=>m.cat===c).map(([k,m])=>opt(k,m.name)).join('')}</optgroup>`).join('')}</select></label>`;
}
function trainingTips(es){
  const T=[],x=X(es);
  if(x.length){
    const a=agg(x,'x01');
    if(a.coq!=null&&sumOf(x,'coAtt')>=6&&a.coq<35) T.push({t:"Bob's 27",why:`Deine Doppelquote liegt bei ${Math.round(a.coq)} %. Bob's 27 trainiert jedes Double der Reihe nach.`,mode:'bobs',opts:{minus:true}});
    if(a.f9-a.avg>12) T.push({t:'Checkout-Training 61 bis 100',why:`Dein First-9-Average (${fmt(a.f9)}) liegt deutlich über dem Gesamtschnitt (${fmt(a.avg)}). Im Finish-Bereich gehen Punkte verloren.`,mode:'ct',opts:{range:'mid',darts:6,count:10}});
    if(a.avg<45) T.push({t:'Shanghai über 20 Runden',why:`Bei einem Average von ${fmt(a.avg)} bringt Treffsicherheit auf einzelne Zahlen am meisten.`,mode:'shanghai',opts:{rounds:20}});
    const hm={};x.forEach(e=>{for(const k in (e.hm||{})) hm[k]=(hm[k]||0)+e.hm[k];});
    const tw=(hm.S20||0)+(hm.T20||0)+(hm.D20||0),nb=['S1','T1','D1','S5','T5','D5'].reduce((s,k)=>s+(hm[k]||0),0);
    if(tw+nb>=60&&nb>tw*0.6) T.push({t:'Rund um die Uhr mit Sprüngen',why:`Rund um die 20 landest du oft in der 1 oder 5 (${Math.round(nb/(tw+nb)*100)} % dieser Darts). Gezieltes Spielen einzelner Felder verbessert die Gruppierung.`,mode:'atc',opts:{multi:true}});
  }else T.push({t:'501 spielen',why:'Spiele ein paar 501-Partien, gern gegen den Computer. Danach erkennt der Plan deine Schwächen.',mode:'x01',opts:{start:501,out:'double'}});
  const c=es.filter(e=>e.mode==='cricket');
  if(c.length){const a=agg(c,'cricket');if(a.mpr<2) T.push({t:'Cricket-Training',why:`Mit ${fmt(a.mpr)} Marks pro Runde lohnt es sich, die Triples 15 bis 20 gezielt zu spielen, zum Beispiel gegen CPU Hobby.`,mode:'cricket',opts:{variant:'standard'}});}
  const ct=es.filter(e=>e.mode==='ct');
  if(ct.length){const a=agg(ct,'ct');if(sumOf(ct,'att')>=5&&a.q<40) T.push({t:'Checkout-Training 2 bis 60',why:`Deine Erfolgsquote im Training liegt bei ${Math.round(a.q)} %. Kleine Finishes festigen die Double-Routine.`,mode:'ct',opts:{range:'low',darts:6,count:10}});}
  if(!T.length) T.push({t:'Checkout-Training 101 bis 170',why:'Aktuell zeigt die Statistik keine deutliche Schwäche. Hohe Finishes sind die nächste Stufe.',mode:'ct',opts:{range:'high',darts:9,count:10}});
  return T.slice(0,4);
}
function drawProfile(){
  const humans=new Map();
  sv.recs.forEach(r=>(r.players||[]).forEach(p=>{if(!p.bot) humans.set(p.name,(humans.get(p.name)||0)+1);}));
  const names=[...humans.keys()].sort((a,b)=>humans.get(b)-humans.get(a));
  if(!names.includes(sv.player)) sv.player=names[0]||null;
  let body;
  if(!names.length) body='<p class="empty">Noch keine Spiele gespeichert. Erfolge und Trainingsplan erscheinen nach deinem ersten beendeten Spiel.</p>';
  else{
    const es=entriesFor(sv.recs,sv.player),done=ACH.filter(a=>achDone(a,es)).length;
    const chips=names.length>1?`<div class="seg" role="group" aria-label="Spieler" style="margin-bottom:16px">${names.map(n=>`<button data-splayer="${esc(n)}" class="${n===sv.player?'on':''}" aria-pressed="${n===sv.player}">${esc(n)}</button>`).join('')}</div>`:'';
    sv.tips=trainingTips(es);
    body=`${chips}${setsHTML(es)}<section><h2>Trainingsplan</h2><div class="tips">${sv.tips.map((t,i)=>`<div class="tip"><b>${esc(t.t)}</b><p>${esc(t.why)}</p><button class="ghost" data-train="${i}">Übernehmen</button></div>`).join('')}</div></section>
    <section><h2>Erfolge <span class="muted">${done} von ${ACH.length}</span></h2><div class="ach">${ACH.map(a=>{const ok=achDone(a,es),prog=!ok&&a.c?` <em>${Math.min(a.c(es),a.goal)}/${a.goal}</em>`:'';return `<div class="a ${ok?'':'lock'}"><b>${ok?'★ ':''}${esc(a.n)}</b><span>${esc(a.d)}${prog}</span></div>`;}).join('')}</div></section>`;
  }
  app.innerHTML=`<div class="wrap"><header class="gbar"><h1 class="gmode">Statistik</h1><button class="ghost" data-act="back">Zurück</button></header>${statTabs()}${body}</div>`;
}

/* ---------- Turnier ---------- */
let tour=store.get('dart.tour'),tourFmt='ko',tourArmed=false,tourErr='';
const saveTour=()=>{if(tour) store.set('dart.tour',tour);else store.del('dart.tour');};
function createTour(){
  const ps=setup.players.map((pl,i)=>({name:(pl.name||'').trim()||'Spieler '+(i+1),bot:pl.bot||0,nick:pl.nick||'',jingle:pl.jingle||(pl.bot?'robot':'fanfare'),aid:pl.aid||'',set:pl.set?setLabel(pl.set):''}));
  tour={id:newId(),mode:setup.mode,opts:clone(setup.opts[setup.mode]),fmt:tourFmt,players:ps};
  if(tourFmt==='ko'){
    const order=shuffle(ps.map((_,i)=>i));
    let size=1;while(size<order.length) size*=2;
    const byes=size-order.length,r0=[];let k=0;
    for(let m=0;m<size/2;m++){
      if(m<byes){const a=order[k++];r0.push({a,b:null,w:a,bye:true});}
      else r0.push({a:order[k++],b:order[k++],w:null});
    }
    tour.rounds=[r0];
    for(let cnt=size/4;cnt>=1;cnt/=2) tour.rounds.push(Array.from({length:cnt},()=>({a:null,b:null,w:null})));
    resolveKO();
  }else{
    const gs=[];for(let i=0;i<ps.length;i++) for(let j=i+1;j<ps.length;j++) gs.push({a:i,b:j,w:null});
    tour.games=shuffle(gs);
  }
  saveTour();
}
function resolveKO(){
  for(let r=1;r<tour.rounds.length;r++) tour.rounds[r].forEach((m,i)=>{
    const fa=tour.rounds[r-1][2*i],fb=tour.rounds[r-1][2*i+1];
    m.a=fa.w!=null?fa.w:null;m.b=fb.w!=null?fb.w:null;
    if(m.w!=null&&m.w!==m.a&&m.w!==m.b) m.w=null;
  });
}
function roundName(r){const k=tour.rounds.length-1-r;return k===0?'Finale':k===1?'Halbfinale':k===2?'Viertelfinale':'Runde '+(r+1);}
function tourMatch(ref){const p=ref.split(':');return p[0]==='k'?(tour.rounds[+p[1]]||[])[+p[2]]:tour.games[+p[1]];}
function standings(){
  const st=tour.players.map((_,i)=>({i,sp:0,s:0,u:0,n:0,pts:0}));
  tour.games.forEach(g=>{
    if(g.w==null) return;
    st[g.a].sp++;st[g.b].sp++;
    if(g.w===-1){st[g.a].u++;st[g.b].u++;st[g.a].pts++;st[g.b].pts++;}
    else{const l=g.w===g.a?g.b:g.a;st[g.w].s++;st[g.w].pts+=2;st[l].n++;}
  });
  return st.sort((x,y)=>y.pts-x.pts||y.s-x.s);
}
function renderTour(){
  const hdr='<header class="gbar"><h1 class="gmode">Turnier</h1><button class="ghost" data-act="back">Zurück</button></header>';
  if(!tour){
    const md=MODES[setup.mode];
    app.innerHTML=`<div class="wrap">${hdr}<p class="muted">Spielmodus, Regeln und Teilnehmer kommen vom Startbildschirm. Jedes Match wird zu zweit gespielt, Computer-Gegner spielen mit.</p>
    <section><h2>Einstellungen</h2><div class="opt"><span class="olabel">Spielmodus</span><b>${md.name}</b>, ${esc(md.sub(setup.opts[setup.mode]))}</div>
    <div class="opt"><span class="olabel">Teilnehmer</span>${setup.players.map(p=>esc(p.name)).join(', ')}</div>
    <div class="opt"><span class="olabel">Format</span><div class="seg" role="group" aria-label="Format">${[['ko','K.-o.-System'],['rr','Jeder gegen jeden']].map(c=>`<button data-tf="${c[0]}" class="${tourFmt===c[0]?'on':''}" aria-pressed="${tourFmt===c[0]}">${c[1]}</button>`).join('')}</div></div></section>
    ${tourErr?`<p class="err" role="alert">${esc(tourErr)}</p>`:''}
    <button class="primary start" data-act="tourstart">Turnier starten</button></div>`;
    return;
  }
  const pn=i=>i==null?'<span class="muted">offen</span>':esc(tour.players[i].name);
  const row=(m,ref)=>{
    const can=m.a!=null&&m.b!=null&&m.w==null,cls=i=>i!=null&&m.w===i?'win':'';
    return `<li class="match"><div><span class="${cls(m.a)}">${pn(m.a)}</span><span class="vs">gegen</span><span class="${cls(m.b)}">${m.bye?'<span class="muted">Freilos</span>':pn(m.b)}</span>${m.tie?'<small class="warnt">Unentschieden, bitte neu spielen</small>':''}${m.w===-1?'<small class="muted">Unentschieden</small>':''}</div>${can?`<button class="primary sm" data-play="${ref}">Spielen</button>`:''}</li>`;
  };
  let body='',champ=null;
  if(tour.fmt==='ko'){
    const fin=tour.rounds[tour.rounds.length-1][0];if(fin.w!=null) champ=[fin.w];
    body=tour.rounds.map((rd,r)=>`<section><h2>${roundName(r)}</h2><ul class="matches">${rd.map((m,i)=>row(m,'k:'+r+':'+i)).join('')}</ul></section>`).join('');
  }else{
    const st=standings();
    if(tour.games.every(g=>g.w!=null)) champ=st.filter(s=>s.pts===st[0].pts&&s.s===st[0].s).map(s=>s.i);
    body=`<section><h2>Tabelle</h2><div class="tw"><table class="rank"><thead><tr><th>Spieler</th><th>Sp</th><th>S</th><th>U</th><th>N</th><th>Pkt</th></tr></thead><tbody>${st.map(s=>`<tr><th>${esc(tour.players[s.i].name)}</th><td>${s.sp}</td><td>${s.s}</td><td>${s.u}</td><td>${s.n}</td><td>${s.pts}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h2>Spiele</h2><ul class="matches">${tour.games.map((m,i)=>row(m,'g:'+i)).join('')}</ul></section>`;
  }
  const champHTML=champ?`<div class="champ"><span>Turniersieg</span><b>${champ.map(i=>esc(tour.players[i].name)).join(' und ')}</b></div>`:'';
  app.innerHTML=`<div class="wrap">${hdr}<p class="muted">${MODES[tour.mode].name}, ${esc(MODES[tour.mode].sub(tour.opts))}, ${tour.fmt==='ko'?'K.-o.-System':'Jeder gegen jeden'}</p>${champHTML}${body}
  <button class="ghost ${tourArmed?'warn':''}" data-act="tourend" style="width:100%;margin-top:6px">${tourArmed?'Nochmal tippen zum Bestätigen':champ?'Turnier abschließen':'Turnier abbrechen'}</button></div>`;
}
function startTourMatch(ref){
  const m=tourMatch(ref);if(!m||m.a==null||m.b==null) return;
  startGame(false,{mode:tour.mode,opts:tour.opts,players:[m.a,m.b].map(i=>clone(tour.players[i])),tour:{tid:tour.id,ref,map:[m.a,m.b]}});
}
function tourClick(t){
  const a=t.dataset.act;
  if(a==='tour'){tourArmed=false;tourErr='';renderTour();window.scrollTo(0,0);return;}
  if(t.dataset.tf){tourFmt=t.dataset.tf;renderTour();return;}
  if(a==='tourstart'){
    if(setup.players.length<3){tourErr='Für ein Turnier braucht es mindestens 3 Teilnehmer.';renderTour();return;}
    const dup=dupName(setup.players);
    if(dup){tourErr=`Zwei Teilnehmer heißen „${dup}“. Gib allen einen eigenen Namen.`;renderTour();return;}
    tourErr='';createTour();renderTour();return;
  }
  if(a==='tourend'){if(!tourArmed){tourArmed=true;renderTour();return;}tourArmed=false;tour=null;saveTour();renderTour();return;}
  if(t.dataset.play){startTourMatch(t.dataset.play);window.scrollTo(0,0);}
}
function applyTour(g){
  if(!g.tour||!tour||tour.id!==g.tour.tid) return;
  const m=tourMatch(g.tour.ref);if(!m) return;
  if(g.winner.length>1){if(tour.fmt==='ko'){m.tie=true;m.w=null;}else{m.w=-1;m.tie=false;}}
  else{m.w=g.tour.map[g.winner[0]];m.tie=false;}
  if(tour.fmt==='ko') resolveKO();
  saveTour();
}
function revertTour(g){
  if(!g.tour||!tour||tour.id!==g.tour.tid) return;
  const m=tourMatch(g.tour.ref);if(!m) return;
  m.w=null;m.tie=false;
  if(tour.fmt==='ko') resolveKO();
  saveTour();
}
function onFinish(){saveRecord(buildRecord(game));applyTour(game);drillDone(game);if(setup.walkon&&!scr&&game.winner.length===1) winJingle(game.players[game.winner[0]]);}
const toTour=()=>endGame(true);

/* ---------- Online ---------- */
let onl=null,onlRev=0,onlBusy=false,onlPending=false;
const onlView={step:'menu',seat:0,code:'',st:null,rev:0,err:'',checking:false,nodb:false};
const mySeat=()=>onl&&game?game.players.findIndex(p=>p.name===onl.name):-1;
const canAct=()=>!onl||!game||game.cur===mySeat();
async function pushOnline(){
  if((!onl&&!scr)||!game) return;
  if(onlBusy){onlPending=true;return;}
  onlBusy=true;
  try{
    do{
      onlPending=false;
      const db=await getDbNs();if(!db||(!onl&&!scr)||!game) break;
      onlRev++;
      await db.doc('online/'+(onl?onl.code:scr.code)).set({state:JSON.stringify({g:game,h:history.slice(-40)}),rev:onlRev,ts:Date.now()});
    }while(onlPending);
  }catch(e){onlNote('Online-Verbindung gestört, der letzte Wurf wurde eventuell nicht übertragen.');}
  onlBusy=false;
}
function onlNote(t){const el=document.getElementById('camstat');if(el){el.hidden=false;el.textContent=t;}}
async function onlSubscribe(){
  const db=await getDbNs();if(!db||!onl) return;
  if(onl.unsub) try{onl.unsub();}catch(e){}
  onl.unsub=db.doc('online/'+onl.code).onSnapshot(snap=>{
    if(!snap.exists||!onl) return;
    const d=snap.data();if(!d||typeof d.rev!=='number'||d.rev<=onlRev) return;
    onlRev=d.rev;
    let st;try{st=untrusted(JSON.parse(d.state));}catch(e){return;}
    if(!st||!validGame(st.g)) return;
    st.h=Array.isArray(st.h)?st.h.filter(validGame):[];
    const prevCur=game?game.cur:-1,wasWin=!!(game&&game.winner),prevGid=game&&game.gid;
    game=st.g;history=st.h||[];
    store.set('dart.game',{g:game,h:history});
    if(document.getElementById('pad')) update(); else{saved={g:game,h:history};startGame(true);}
    if(game.winner&&(!wasWin||prevGid!==game.gid)) saveRecord(buildRecord(game));
    else if(wasWin&&!game.winner&&prevGid===game.gid) deleteRecord(game.gid);
    if(!game.winner&&game.cur!==prevCur) say(promptCall(game));
  },()=>onlNote('Online-Verbindung unterbrochen. Lade die Seite neu, um wieder beizutreten.'));
}
function onlLeave(){
  if(onl&&onl.unsub) try{onl.unsub();}catch(e){}
  onl=null;onlRev=0;store.del('dart.online');
}
async function renderOnline(){
  const hdr='<header class="gbar"><h1 class="gmode">Online</h1><button class="ghost" data-act="back">Zurück</button></header>';
  if(!onlView.checking){
    onlView.checking=true;
    app.innerHTML=`<div class="wrap">${hdr}<p class="muted">Verbindung wird geprüft …</p></div>`;
    const db=await getDbNs();onlView.nodb=!db;
    if(document.querySelector('.gmode')?.textContent!=='Online') return;
  }
  let body;
  if(onlView.nodb) body='<p class="empty">Online-Spiele funktionieren in der Pfeilerl-Version auf claude.ai, weil dort der gemeinsame Spielstand gespeichert wird. In der installierten Version ist dieser Modus nicht verfügbar.</p>';
  else if(onlView.step==='seat'){
    const ps=onlView.st.g.players;
    body=`<section><h2>Spiel ${esc(onlView.code)}</h2><p class="muted">${esc(MODES[onlView.st.g.mode].name)}, ${esc(MODES[onlView.st.g.mode].sub(onlView.st.g.opts))}</p>
    <div class="opt"><span class="olabel">Wer bist du?</span><div class="seg" role="group" aria-label="Spieler wählen">${ps.map((p,i)=>p.bot?'':`<button data-ojseat="${i}">${esc(p.name)}</button>`).join('')}</div></div></section>`;
  }else{
    const humans=setup.players.map((p,i)=>[p,i]).filter(x=>!x[0].bot);
    if(!humans.some(x=>x[1]===onlView.seat)) onlView.seat=humans.length?humans[0][1]:0;
    body=`<section><h2>Spiel erstellen</h2><p class="muted">Modus, Regeln und Spieler kommen vom Startbildschirm: ${esc(MODES[setup.mode].name)} mit ${setup.players.map(p=>esc(p.name)).join(', ')}.</p>
    <div class="opt"><span class="olabel">Ich spiele als</span><div class="seg" role="group" aria-label="Eigener Spieler">${humans.map(([p,i])=>`<button data-oseat="${i}" class="${i===onlView.seat?'on':''}" aria-pressed="${i===onlView.seat}">${esc(p.name)}</button>`).join('')}</div></div>
    <button class="primary start" data-act="onlcreate">Online-Spiel erstellen</button></section>
    <section><h2>Beitreten</h2><div class="joinrow"><input id="onlcode" maxlength="5" placeholder="Code, z. B. K7QZD" autocapitalize="characters" autocomplete="off" aria-label="Spielcode"><button class="primary" data-act="onljoin">Beitreten</button></div></section>
    <section><h2>So funktioniert es</h2><p class="muted">Teile Pfeilerl über das Teilen-Menü von claude.ai mit deinem Mitspieler und gib ihm mindestens die Berechtigung „Contributor“. Er öffnet den Link, tippt auf „Online“ und gibt den Code ein. Jeder wirft an seinem eigenen Board und tippt nur seine eigenen Würfe ein.</p></section>`;
  }
  app.innerHTML=`<div class="wrap">${hdr}${onlView.err?`<p class="err" role="alert">${esc(onlView.err)}</p>`:''}${body}</div>`;
}
async function onlClick(t){
  const a=t.dataset.act;onlView.err='';
  if(a==='online'){onlView.step='menu';onlView.checking=false;renderOnline();window.scrollTo(0,0);return;}
  if(t.dataset.oseat!==undefined){onlView.seat=+t.dataset.oseat;renderOnline();return;}
  if(a==='onlcreate'){
    const m=MODES[setup.mode];
    if(setup.players.length<2){onlView.err='Ein Online-Spiel braucht mindestens 2 Spieler.';renderOnline();return;}
    if(m.minPlayers&&setup.players.length<m.minPlayers){onlView.err=`${m.name} braucht mindestens ${m.minPlayers} Spieler.`;renderOnline();return;}
    const code=Array.from({length:5},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
    onl={code,name:'',host:true};onlRev=0;
    startGame(false);
    onl.name=game.players[onlView.seat].name;game.online=code;
    store.set('dart.online',{code,name:onl.name,host:true});
    saveGame();onlSubscribe();update();
    return;
  }
  if(a==='onljoin'){
    const code=(document.getElementById('onlcode').value||'').trim().toUpperCase();
    if(!validCode(code)){onlView.err='Der Code besteht aus 5 Buchstaben oder Ziffern.';renderOnline();return;}
    try{
      const db=await getDbNs();
      const snap=await db.doc('online/'+code).get();
      if(!snap.exists){onlView.err='Kein Spiel mit diesem Code gefunden.';renderOnline();return;}
      const d=snap.data(),st=untrusted(JSON.parse(d.state));if(!st||!validGame(st.g)){onlView.err='Dieses Spiel ist beschädigt und lässt sich nicht öffnen.';renderOnline();return;}onlView.st=st;onlView.rev=typeof d.rev==='number'?d.rev:0;onlView.code=code;onlView.step='seat';renderOnline();
    }catch(e){onlView.err='Beitreten hat nicht geklappt. Prüfe, ob der Link mit dir geteilt wurde.';renderOnline();}
    return;
  }
  if(t.dataset.ojseat!==undefined){
    const st=onlView.st,i=+t.dataset.ojseat;
    onl={code:onlView.code,name:st.g.players[i].name,host:false};onlRev=onlView.rev;
    store.set('dart.online',{code:onl.code,name:onl.name,host:false});
    saved={g:st.g,h:st.h||[]};startGame(true);onlSubscribe();
  }
}

/* ---------- Kamera ---------- */
const CAL_PTS=[['die Mitte des Bulls',0,0],['den äußeren Draht der Double 20, in der Mitte des Feldes',0,170],['den äußeren Draht der Double 6, in der Mitte des Feldes',170,0],['den äußeren Draht der Double 3, in der Mitte des Feldes',0,-170],['den äußeren Draht der Double 11, in der Mitte des Feldes',-170,0]];
/* Auflösungen wie bei Autodarts. Die Kameras liefern dabei meist MJPEG, so passen auch drei an einen USB-Anschluss. */
const CAM_RES=[{w:1280,h:720,n:'1280×720'},{w:640,h:360,n:'640×360'},{w:640,h:480,n:'640×480 (4:3)'}];
const CAM_FPS=[30,15];
const CAM_SPEED=[['Sehr langsam',250],['Langsam',180],['Standard',120],['Schnell',80],['Sehr schnell',50]];
const CAM_STANDBY=[[0,'Nie'],[5,'5 Min.'],[15,'15 Min.'],[30,'30 Min.']];
let CW=480,CH=270;
const cam={devices:[],slots:store.get('dart.camslots')||[null,null,null],streams:[],videos:[],cal:store.get('dart.camcal')||{},active:false,state:'idle',ref:[],prev:[],still:0,idle:0,timer:null,pv:null,last:'',err:'',sens:1,calSlot:-1,calPts:[],calImg:null,calFit:null,diag:false,thr:28,margin:0.12,lastP:null,
  res:0,fps:30,speed:2,standby:15,check:true,mode:null,masks:[],meas:[0,0,0],moved:[false,false,false],sleeping:false,lastAct:Date.now(),sbTimer:null};
Object.assign(cam,store.get('dart.camset')||{});
const saveCamSet=()=>store.set('dart.camset',{sens:cam.sens,thr:cam.thr,margin:cam.margin,res:cam.res,fps:cam.fps,speed:cam.speed,standby:cam.standby,check:cam.check});
let camHost=null,work=null,wctx=null;
function ensureHost(){
  if(camHost) return;
  camHost=document.createElement('div');camHost.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
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
  if(cam.check) setTimeout(checkMoved,1200);
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
function locate(tips){
  const lines=tips.map(({c,t})=>{const [a1,a2,a3,c1,c2]=c.p;return [a1-t.x*c1,a2-t.x*c2,t.x-a3];});
  const P=triangulate(lines);if(P) return P;
  const one=tips.find(({c})=>c.angled&&c.H);
  if(one){const Q=invH(one.c.H,one.t.x,one.t.y);if(Q&&Math.hypot(Q[0],Q[1])<=260) return Q;}
  return null;
}
const camAllowed=()=>!!game&&!game.winner&&!isBotTurn()&&canAct();
function camTick(){
  const ids=[0,1,2].filter(i=>calOf(i));
  const frames=[0,1,2].map(i=>ids.includes(i)?gray(i):null);
  const live=frames.filter(Boolean).length;
  if(live<2&&!(live===1&&calOf(frames.findIndex(Boolean)).angled)) return;
  // Schwellen in Pixeln der Rechenauflösung (480 breit): ab so vielen veränderten Pixeln gilt ein Dart als gelandet
  const TH=[180,110,60][cam.sens]*CW*CH/129600,HAND=0.12;
  let mxR=0,mxM=0,mxF=0;
  frames.forEach((f,i)=>{
    if(!f) return;const m=maskOf(i);
    if(!cam.ref[i]||cam.ref[i].length!==f.length) cam.ref[i]=f;
    const d=diffCount(f,cam.ref[i],m);mxR=Math.max(mxR,d.n);mxF=Math.max(mxF,d.frac);
    if(cam.prev[i]&&cam.prev[i].length===f.length) mxM=Math.max(mxM,diffCount(f,cam.prev[i],m).n);
    cam.prev[i]=f;
  });
  if(cam.state==='idle'){
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
      const d=classify(P[0],-P[1]);
      cam.last='Erkannt: '+(d.mult?label(d):'daneben');
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
  const [tx,ty]=pt(185,0);x.fillStyle=color||'rgba(47,224,192,.95)';x.font=`bold ${Math.max(10,w/40)}px sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText('20',tx,ty);
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
    const fit=fitCal(cam.calPts);
    if(fit.p&&fit.H) cam.calFit=fit;
    else{cam.err='Die Kalibrierung ging nicht auf. Bitte die Punkte genauer setzen.';cam.calPts=[];}
  }
  renderCam();
}
function calSave(){
  const i=cam.calSlot,fit=cam.calFit;if(i<0||!fit) return;
  cam.cal[cam.slots[i]]=Object.assign({pts:cam.calPts,ar:cam.calImg.width/cam.calImg.height,thumb:thumbOf(i)},fit);
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
    ${fit?`<p>Kamera ${cam.calSlot+1}: Passt das grüne Raster auf Ringe und Segmente der Scheibe? <span class="${q<1?'okc':'warnt'}">Abweichung ${q.toFixed(1).replace('.',',')} %${q<1?', gut':', bitte Punkte genauer setzen'}</span></p>`:
      `<p>Kamera ${cam.calSlot+1}: Tippe auf <b>${CAL_PTS[k][0]}</b> <span class="muted">(Punkt ${k+1} von ${CAL_PTS.length}). Orientier dich an den Zahlen am Rand, im Kamerabild kann die 20 auch unten oder seitlich liegen.</span></p>`}
    ${cam.err?`<p class="err" role="alert">${esc(cam.err)}</p>`:''}
    <canvas id="calcv" class="calcv" width="${cam.calImg?cam.calImg.width:960}" height="${cam.calImg?cam.calImg.height:540}" aria-label="Standbild der Kamera zum Kalibrieren"></canvas>
    <div class="addrow">${fit?'<button class="primary" data-act="calsave">Übernehmen</button><button class="ghost" data-act="calreset">Punkte neu setzen</button>':`<button class="ghost" data-act="calsnap">Neues Standbild</button><button class="ghost" data-act="calundo" ${k?'':'disabled'}>Punkt zurück</button>`}<button class="ghost" data-act="calcancel">Abbrechen</button></div>
    <p class="muted small">Tipp: Die Punkte möglichst genau auf den Draht setzen. Bei Weitwinkel-Kameras weicht das Raster am Rand etwas ab, das ist normal.</p></div>`;
    drawCal();return;
  }
  const slots=cam.devices.length?[0,1,2].map(i=>{
    const ok=!!calOf(i),stale=calStale(i);
    return `<div class="camslot"><div class="camhead"><b>Kamera ${i+1}</b><span class="${ok?'okc':'muted'}">${ok?(calOf(i).angled?'kalibriert, schräg':'kalibriert, flach'):stale?'neu kalibrieren':'nicht kalibriert'}</span></div>
    <canvas id="camprev${i}" class="camprev" width="${CW}" height="${CH}" aria-label="Vorschau Kamera ${i+1}"></canvas>
    <p class="muted small camfps" id="camfps${i}"></p>
    ${cam.moved[i]?'<p class="err small">Das Bild weicht stark von der Kalibrierung ab. Wurde die Kamera bewegt? Bitte das Raster prüfen und neu kalibrieren.</p>':''}
    ${stale?'<p class="muted small">Die Auflösung hat ein anderes Seitenverhältnis als bei der Kalibrierung.</p>':''}
    <label class="olabel" for="camdev${i}">Gerät</label><select id="camdev${i}" class="pinput" data-camdev="${i}"><option value="">Keine Kamera</option>${cam.devices.map((d,j)=>`<option value="${j}" ${cam.slots[i]===d.id?'selected':''}>${esc(d.label)}</option>`).join('')}</select>
    ${cam.diag&&ok?`<p class="diagl" id="camdiag${i}">Diagnose läuft …</p>`:''}
    <button class="ghost" data-cal="${i}" ${cam.videos[i]?'':'disabled'}>${ok?'Neu kalibrieren':'Kalibrieren'}</button></div>`;}).join(''):'';
  const anyFlat=[0,1,2].some(i=>calOf(i)&&!calOf(i).angled);
  app.innerHTML=`<div class="wrap camwide">${hdr}
  <p class="muted">Drei USB-Kameras am Ring rund ums Board, etwa im 120-Grad-Abstand, schräg auf die Scheibe blickend, so wie bei Autodarts. Die Erkennung läuft im Browser am PC. Wichtig: Autodarts und andere Kamera-Programme vorher ganz schließen, eine Kamera kann immer nur ein Programm benutzen. Daneben liegende Würfe korrigierst du mit „Rückgängig“ und den Tasten.</p>
  ${cam.err?`<p class="err" role="alert">${esc(cam.err)}</p>`:''}
  ${cam.sleeping?'<p class="muted">Kameras im Standby, sie starten gleich wieder.</p>':''}
  ${cam.mode&&cam.streams.some(Boolean)?`<p class="muted small">Angefordert: ${camModeText(cam.mode)}${cam.modeStep?', sparsamer wegen knapper USB-Bandbreite':''}.</p>`:''}
  <button class="ghost" data-act="camscan" style="margin-bottom:14px">${cam.devices.length?'Kameras neu suchen':'Kameras suchen'}</button>
  <div class="camgrid">${slots}</div>
  <section><h2>Kameraeinstellungen</h2>
  <div class="opt"><span class="olabel">Auflösung</span>${segBtns('data-cres',CAM_RES.map((r,k)=>[k,r.n]),cam.res,'Auflösung')}</div>
  <div class="opt"><span class="olabel">Bilder pro Sekunde</span>${segBtns('data-cfps',CAM_FPS.map(f=>[f,String(f)]),cam.fps,'Bilder pro Sekunde')}</div>
  <div class="opt"><span class="olabel">Erkennungsgeschwindigkeit</span>${segBtns('data-cspeed',CAM_SPEED.map((s,k)=>[k,s[0]]),cam.speed,'Erkennungsgeschwindigkeit')}</div>
  <div class="opt"><span class="olabel">Kameras in Standby nach</span>${segBtns('data-cstby',CAM_STANDBY,cam.standby,'Standby')}</div>
  <div class="opt"><span class="olabel">Beim Start prüfen, ob eine Kamera bewegt wurde</span>${segBtns('data-ccheck',[[false,'Aus'],[true,'An']],cam.check,'Kalibrierung beim Start prüfen')}</div></section>
  ${cam.devices.length?`<section><h2>Erkennung</h2><div class="opt"><span class="olabel">Empfindlichkeit</span><div class="seg" role="group" aria-label="Empfindlichkeit">${['Niedrig','Mittel','Hoch'].map((n,i)=>`<button data-sens="${i}" class="${cam.sens===i?'on':''}" aria-pressed="${cam.sens===i}">${n}</button>`).join('')}</div></div>
  <div class="opt"><span class="olabel">Helligkeitsschwelle</span><div class="seg" role="group" aria-label="Helligkeitsschwelle">${[[18,'Fein'],[28,'Normal'],[40,'Grob']].map((c,i)=>`<button data-thr="${i}" class="${cam.thr===c[0]?'on':''}" aria-pressed="${cam.thr===c[0]}">${c[1]}</button>`).join('')}</div></div>
  ${anyFlat?`<div class="opt"><span class="olabel">Erkennungsbereich um die Board-Oberfläche (flache Kameras)</span><div class="seg" role="group" aria-label="Erkennungsbereich">${[[0.06,'Schmal'],[0.12,'Mittel'],[0.2,'Breit']].map((c,i)=>`<button data-mg="${i}" class="${cam.margin===c[0]?'on':''}" aria-pressed="${cam.margin===c[0]}">${c[1]}</button>`).join('')}</div></div>`:''}
  <div class="addrow" style="margin-bottom:12px"><button class="ghost" data-act="camdiag">${cam.diag?'Diagnose aus':'Diagnose an'}</button><button class="ghost" data-act="camref">Referenzbild neu setzen</button></div>
  ${cam.diag?'<p class="muted">Rot zeigt Veränderungen zum Referenzbild im Suchbereich, der gelbe Punkt die gefundene Dartspitze. Ohne Wurf sollte kaum Rot zu sehen sein.</p>':''}
  <button class="primary start" data-act="camtoggle">${cam.active?'Erkennung stoppen':'Erkennung starten'}</button>
  <p class="camline" id="camstat">${esc(cam.last||'Noch kein Wurf erkannt')}</p>
  <figure class="heat"><canvas id="camboard" class="camboard" width="220" height="220" aria-label="Zuletzt erkannte Position"></canvas><figcaption>Zuletzt erkannte Position am Board</figcaption></figure></section>`:''}
  </div>`;
  camPreview();drawMiniBoard();
}
async function camRestart(){camStop();cam.masks=[];cam.ref=[];cam.prev=[];if(cam.devices.length) await camStart();}
async function camClick(t){
  const a=t.dataset.act;cam.err='';
  if(a==='cam'){renderCam();window.scrollTo(0,0);return;}
  if(a==='camscan'){app.querySelector('[data-act="camscan"]').textContent='Suche …';await camScan();renderCam();return;}
  if(t.dataset.cal!==undefined){cam.calSlot=+t.dataset.cal;cam.calPts=[];cam.calFit=null;calSnap();renderCam();return;}
  if(t.dataset.cres!==undefined){cam.res=+t.dataset.cres;saveCamSet();await camRestart();renderCam();return;}
  if(t.dataset.cfps!==undefined){cam.fps=CAM_FPS[+t.dataset.cfps];saveCamSet();await camRestart();renderCam();return;}
  if(t.dataset.cspeed!==undefined){cam.speed=+t.dataset.cspeed;saveCamSet();if(cam.timer){clearInterval(cam.timer);cam.timer=setInterval(camTick,camTickMs());}renderCam();return;}
  if(t.dataset.cstby!==undefined){cam.standby=CAM_STANDBY[+t.dataset.cstby][0];saveCamSet();renderCam();return;}
  if(t.dataset.ccheck!==undefined){cam.check=t.dataset.ccheck==='1';saveCamSet();if(cam.check) checkMoved();renderCam();return;}
  if(t.dataset.sens!==undefined){cam.sens=+t.dataset.sens;saveCamSet();renderCam();return;}
  if(t.dataset.thr!==undefined){cam.thr=[18,28,40][+t.dataset.thr];saveCamSet();renderCam();return;}
  if(t.dataset.mg!==undefined){cam.margin=[0.06,0.12,0.2][+t.dataset.mg];saveCamSet();cam.masks=[];renderCam();return;}
  if(a==='camdiag'){cam.diag=!cam.diag;if(cam.diag&&!cam.active){cam.ref=[];}renderCam();return;}
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

/* ---------- Trainer ---------- */
let sampleP=null;
const getSample=()=>sampleP||(sampleP=(async()=>{try{if(!window.claude||typeof window.claude.use!=='function') return null;return await window.claude.use('sample');}catch(e){return null;}})());
const coach={player:null,recs:[],busy:'',err:'',ctl:null,techBusy:false,chatBusy:false,fbBusy:false,ai:false,imgOK:false,imgMax:0,data:null,F:[]};
let coachData=store.get('dart.coach')||{};
const saveCoach=()=>store.set('dart.coach',coachData);
const cd=()=>coachData[coach.player]||(coachData[coach.player]={analysis:null,plan:[],chat:[],feedback:'',tech:''});
const onCoach=()=>{const el=document.querySelector('.gmode');return !!el&&el.textContent==='Trainer';};
const avgArr=a=>a.reduce((s,v)=>s+v,0)/a.length;
const fmtText=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>');
const TECH={
  rechts:{titel:'Dart driftet nach rechts',text:'Häufig wandert der Ellbogen beim Abwurf nach außen oder die Schulter steht nicht in Wurfrichtung. Prüfe vor dem Spiegel, ob Auge, Dart und Ziel eine Linie bilden und der Arm nach dem Abwurf gerade zum Ziel zeigt.'},
  links:{titel:'Dart driftet nach links',text:'Oft dreht das Handgelenk beim Loslassen ein oder der Arm zieht quer vor den Körper. Halte den Ellbogen ruhig und lass die Hand nach dem Abwurf gerade zum Ziel auslaufen.'},
  gruppe:{titel:'Gruppierung zu breit',text:'Gleicher Griff, gleiche Abwurfposition und gleicher Rhythmus bei jedem Dart sind wichtiger als Kraft. Markiere dir den Griffpunkt am Barrel und wirf ruhiger statt fester.'},
  schwank:{titel:'Ungleichmäßige Aufnahmen',text:'Eine feste Routine hilft: gleicher Stand, einmal durchatmen, zielen, werfen. Zwischen den Darts nicht hetzen, aber auch nicht zu lange zielen.'},
  muede:{titel:'Konzentration lässt nach',text:'Wird die zweite Spielhälfte schwächer, fehlt oft Wurf-Ausdauer. Kurze, regelmäßige Einheiten von 20 bis 30 Minuten bringen mehr als selten lange.'},
  doppel:{titel:'Doubles mit System',text:'Wähle feste Lieblings-Doubles, etwa D16 und D20, und spiele Finishes gezielt darauf. Ziel ist die Mitte des Doubles, nicht der Draht.'},
  finish:{titel:'Finish-Wege kennen',text:'Plane den Weg schon beim Scoring: Lass dir gerade Reste wie 40 oder 32 stehen und nutze die Checkout-Vorschläge der App als Lernhilfe.'},
  basis:{titel:'Basis festigen',text:'Stabiler Stand mit dem Wurfarm-Fuß vorne, ruhiger Oberkörper und ein gerader Follow-through zum Ziel. Ohne auffällige Schwäche bringt Wurf-Konstanz am meisten.'}
};
function analyze(name,es){
  const F=[],data={spieler:name,spiele_gesamt:es.length,modi:{}};
  const x=X(es);
  if(x.length){
    const a=agg(x,'x01'),vs=x.flatMap(e=>e.vs||[]);
    const d={spiele:x.length,average:+a.avg.toFixed(1),first9:+a.f9.toFixed(1),doppelquote_prozent:a.coq==null?null:Math.round(a.coq),hoechste_aufnahme:a.best,hoechstes_finish:a.co,aufnahmen_100_bis_139:a.v100,aufnahmen_140_bis_179:a.v140,aufnahmen_180:a.v180,average_letzte_spiele:a.trend.slice(-10).map(v=>+v.toFixed(1))};
    if(vs.length>=15){
      const m=avgArr(vs),sd=Math.sqrt(vs.reduce((s,v)=>s+(v-m)**2,0)/vs.length);
      Object.assign(d,{aufnahmen_gezaehlt:vs.length,aufnahme_schnitt:+m.toFixed(1),aufnahme_streuung:+sd.toFixed(1)});
      const f=[],l=[];x.forEach(e=>{const v=e.vs||[];if(v.length>=6){const h=Math.floor(v.length/2);f.push(...v.slice(0,h));l.push(...v.slice(h));}});
      if(f.length>=6&&l.length>=6){
        const fm=avgArr(f),lm=avgArr(l);d.aufnahme_schnitt_erste_spielhaelfte=+fm.toFixed(1);d.aufnahme_schnitt_zweite_spielhaelfte=+lm.toFixed(1);
        if(fm-lm>10) F.push({id:'muede',t:'Leistung fällt im Spiel ab',d:`Erste Spielhälfte im Schnitt ${fmt(fm)} Punkte pro Aufnahme, zweite Hälfte ${fmt(lm)}.`,lvl:'warn'});
      }
      if(m>0&&sd>m*0.55) F.push({id:'schwank',t:'Aufnahmen schwanken stark',d:`Im Schnitt ${fmt(m)} Punkte pro Aufnahme bei einer Streuung von ±${fmt(sd)}.`,lvl:'warn'});
    }
    if(a.coq!=null&&sumOf(x,'coAtt')>=6) F.push(a.coq<30?{id:'doppel',t:'Doubles kosten dich Legs',d:`Doppelquote ${Math.round(a.coq)} %. Gute Amateure liegen bei 30 bis 40 %.`,lvl:'warn'}:{id:'doppelgut',t:'Doppelquote solide',d:`${Math.round(a.coq)} % deiner Darts auf ein Finish-Double treffen.`,lvl:'ok'});
    if(a.f9-a.avg>12) F.push({id:'finish',t:'Punkte gehen im Finish verloren',d:`First 9 im Schnitt ${fmt(a.f9)}, Gesamtschnitt ${fmt(a.avg)}.`,lvl:'warn'});
    data.modi.x01=d;
  }
  const hm={};es.filter(e=>e.mode==='x01'||e.mode==='score100').forEach(e=>{for(const k in (e.hm||{})) hm[k]=(hm[k]||0)+e.hm[k];});
  const g=k=>hm[k]||0,t20=g('T20'),s20=g('S20')+g('D20'),r1=g('S1')+g('T1')+g('D1'),l5=g('S5')+g('T5')+g('D5'),tot=t20+s20+r1+l5;
  if(tot>=30){
    const pc=n=>Math.round(n/tot*100);
    data.wuerfe_rund_um_die_20={darts:tot,triple_20_prozent:pc(t20),single_oder_double_20_prozent:pc(s20),rechts_in_der_1_prozent:pc(r1),links_in_der_5_prozent:pc(l5)};
    if(r1>l5*1.6&&r1/tot>0.15) F.push({id:'rechts',t:'Tendenz nach rechts',d:`${pc(r1)} % deiner Darts rund um die 20 landen in der 1, nur ${pc(l5)} % in der 5.`,lvl:'warn'});
    else if(l5>r1*1.6&&l5/tot>0.15) F.push({id:'links',t:'Tendenz nach links',d:`${pc(l5)} % deiner Darts rund um die 20 landen in der 5, nur ${pc(r1)} % in der 1.`,lvl:'warn'});
    if(t20/tot<0.12) F.push({id:'gruppe',t:'Triple 20 selten getroffen',d:`Nur ${pc(t20)} % deiner Darts rund um die 20 sind Triple.`,lvl:'warn'});
    else if(t20/tot>0.25) F.push({id:'t20gut',t:'Starke Triple-Quote',d:`${pc(t20)} % deiner Darts rund um die 20 landen im Triple.`,lvl:'ok'});
  }
  const byMode={};es.forEach(e=>{if(e.mode!=='x01'&&MODES[e.mode]) (byMode[e.mode]=byMode[e.mode]||[]).push(e);});
  for(const k in byMode){
    const a=agg(byMode[k],k),o={uebung:MODES[k].name,spiele:a.n,siege:a.w};
    for(const key in a) if(!['n','w','pct','trend','main'].includes(key)&&typeof a[key]==='number'&&isFinite(a[key])) o[key]=+a[key].toFixed(1);
    o.verlauf=(a.trend||[]).slice(-5).map(v=>+(+v).toFixed(1));
    data.modi[k]=o;
  }
  const sc=setsCompare(es);
  if(sc) data.dart_sets=sc.map(r=>({set:r.set,spiele:r.spiele,x01_average:r.avg==null?null:+r.avg.toFixed(1),doppelquote_prozent:r.coq==null?null:Math.round(r.coq),triple20_prozent:r.t20==null?null:Math.round(r.t20)}));
  return {data,F};
}
function sanitizePlan(p){
  return (Array.isArray(p)?p:[]).filter(d=>d&&MODES[d.mode]&&!MODES[d.mode].minPlayers).slice(0,5).map(d=>{
    const m=MODES[d.mode],o=Object.assign({},DEFAULTS.opts[d.mode]||{});
    m.options.forEach(op=>{const v=d.opts?d.opts[op.key]:undefined,ch=op.choices.find(c=>String(c[0])===String(v));if(ch) o[op.key]=ch[0];});
    return {mode:d.mode,opts:o,ziel:String(d.ziel||''),warum:String(d.warum||''),done:false,result:''};
  });
}
function localPlan(es){
  const plan=[{mode:'atc',opts:{multi:false},ziel:'Locker einwerfen, Trefferquote über 40 %',warum:'Aufwärmen und Rhythmus finden.'}]
    .concat(trainingTips(es).map(t=>({mode:t.mode,opts:Object.assign({},DEFAULTS.opts[t.mode],t.opts),ziel:'Besser als dein bisheriger Schnitt in diesem Modus',warum:t.why})));
  return plan.filter(d=>!MODES[d.mode].minPlayers).slice(0,5).map(d=>Object.assign(d,{done:false,result:''}));
}
function modeCatalog(){
  return Object.entries(MODES).filter(([,m])=>!m.minPlayers).map(([k,m])=>`- ${k}: ${m.name}, ${m.desc}. Optionen: ${m.options.length?m.options.map(o=>`${o.key} = ${o.choices.map(c=>JSON.stringify(c[0])).join(' | ')}`).join('; '):'keine'}`).join('\n');
}
function errText(e){
  const c=e&&e.code;
  if(c==='not_granted') return 'Der Zugriff auf Claude wurde abgelehnt. Die Auswertung ohne KI steht weiter zur Verfügung.';
  if(c==='rate_limited'||c==='queue_overflow') return 'Gerade zu viele Anfragen. Bitte einen Moment warten.';
  if(c==='invalid_json'||c==='empty_completion') return 'Die Antwort war unvollständig. Bitte nochmal versuchen.';
  if(c==='session_expired') return 'Die Sitzung ist abgelaufen. Bitte die Seite neu laden.';
  return 'Das hat nicht geklappt. Bitte später nochmal versuchen.';
}
async function openCoach(){
  app.innerHTML='<div class="wrap"><header class="gbar"><h1 class="gmode">Trainer</h1><button class="ghost" data-act="back">Zurück</button></header><p class="muted">Trainer wird geladen …</p></div>';
  window.scrollTo(0,0);
  coach.recs=await loadRecords();
  const s=await getSample();coach.ai=!!s;coach.imgOK=false;
  if(s){try{const l=await s.limits();coach.imgOK=!!(l&&l.images);coach.imgMax=l&&l.images?l.images.maxCount:0;}catch(e){}}
  if(onCoach()) renderCoach();
}
function renderCoach(){
  const names=[...new Set([...coach.recs.flatMap(r=>(r.players||[]).filter(p=>!p.bot).map(p=>p.name)),...setup.players.filter(p=>!p.bot).map(p=>(p.name||'').trim()).filter(Boolean)])];
  if(!names.includes(coach.player)) coach.player=names[0]||'Spieler 1';
  const es=entriesFor(coach.recs,coach.player),an=analyze(coach.player,es),c=cd();
  coach.data=an.data;coach.F=an.F;
  const chips=names.length>1?`<div class="seg" role="group" aria-label="Spieler" style="margin-bottom:16px">${names.map(n=>`<button data-cplayer="${esc(n)}" class="${n===coach.player?'on':''}" aria-pressed="${n===coach.player}">${esc(n)}</button>`).join('')}</div>`:'';
  const finds=!es.length?'<p class="empty">Noch keine Spiele gespeichert. Spiel ein paar Partien, am besten 501 und ein Training, dann hat der Trainer Daten zum Auswerten.</p>':
    an.F.length?`<div class="finds">${an.F.map(f=>`<div class="find ${f.lvl}"><b>${esc(f.t)}</b><span>${esc(f.d)}</span></div>`).join('')}</div>`:'<p class="muted">Keine deutlichen Auffälligkeiten. Mit mehr Spielen, vor allem 501 und 100 Darts, werden die Befunde genauer.</p>';
  let ana='';
  if(coach.ai){
    ana+=coach.busy==='analyse'?`<div class="coachbox"><p><b>Trainer analysiert deine Daten …</b></p><p class="muted">Das kann bis zu einer Minute dauern.</p><button class="ghost" data-act="coachstop">Abbrechen</button></div>`:
      `<button class="primary start" data-act="coachai" ${es.length?'':'disabled'}>${c.analysis?'Neu analysieren':'Analyse anfordern'}</button>`;
    if(c.analysis&&coach.busy!=='analyse'){
      const A=c.analysis,li=a=>a.map(x=>`<li>${esc(x)}</li>`).join('');
      ana+=`<div class="coachbox"><p>${fmtText(A.diagnose)}</p>${A.staerken.length?`<h3 class="cath">Stärken</h3><ul class="clist">${li(A.staerken)}</ul>`:''}${A.baustellen.length?`<h3 class="cath">Baustellen</h3><ul class="clist">${li(A.baustellen)}</ul>`:''}</div>
      ${A.technik.length?`<h3 class="cath">Technik</h3><div class="tips">${A.technik.map(t=>`<div class="tip"><b>${esc(t.titel)}</b><p>${fmtText(t.text)}</p></div>`).join('')}</div>`:''}
      <p class="muted small">Analyse vom ${new Date(A.ts).toLocaleDateString('de-DE')}. Der Trainer sieht nur deine Statistik, Technik-Hinweise sind wahrscheinliche Ursachen.</p>`;
    }
  }else{
    const ids=an.F.filter(f=>TECH[f.id]).map(f=>f.id);
    ana=`<div class="tips">${(ids.length?ids:['basis']).slice(0,3).map(id=>`<div class="tip"><b>${esc(TECH[id].titel)}</b><p>${esc(TECH[id].text)}</p></div>`).join('')}</div>
    <p class="muted small">In der Pfeilerl-Version auf claude.ai wertet zusätzlich ein KI-Trainer deine Daten aus und beantwortet Fragen.</p>`;
  }
  if(coach.err) ana=`<p class="err" role="alert">${esc(coach.err)}</p>`+ana;
  const plan=c.plan||[],nextI=plan.findIndex(d=>!d.done),allDone=plan.length&&nextI<0;
  const planHTML=plan.length?`<ol class="drills">${plan.map((d,i)=>`<li class="drill ${d.done?'done':''}"><div><b>${i+1}. ${esc(MODES[d.mode].name)}</b><span class="muted">${esc(MODES[d.mode].sub(d.opts))}</span>${d.ziel?`<span>Ziel: ${esc(d.ziel)}</span>`:''}${d.warum?`<span class="muted">${esc(d.warum)}</span>`:''}${d.result?`<span class="res">Ergebnis: ${esc(d.result)}</span>`:''}</div><button class="${i===nextI?'primary':'ghost'} sm" data-drill="${i}">${d.done?'Nochmal':'Starten'}</button></li>`).join('')}</ol>`:
    `<p class="muted">${coach.ai?'Fordere eine Analyse an, dann stellt dir der Trainer eine passende Einheit zusammen.':'Erstelle eine Einheit aus deinen Befunden.'}</p>`;
  const fb=allDone&&coach.ai?(c.feedback||coach.fbBusy?`<div class="coachbox" id="coachfb">${c.feedback?fmtText(c.feedback):'Trainer schreibt …'}</div>`:`<button class="ghost" data-act="coachfb" style="width:100%">Feedback zur Einheit holen</button>`):'';
  const tech=coach.imgOK?`<section><h2>Technik-Check</h2><p class="muted">Lass dich von der Seite filmen oder fotografieren, ganzer Körper im Bild, Wurfarm zur Kamera. Bei einem Video nimmt der Trainer ${Math.min(coach.imgMax||4,6)} Einzelbilder aus dem Wurf.</p>
    <label class="ghost filebtn ${coach.techBusy?'off':''}">Foto oder Video wählen<input type="file" id="techfile" accept="image/*,video/*" class="vh" ${coach.techBusy?'disabled':''}></label>
    ${c.tech||coach.techBusy?`<div class="coachbox" id="techout">${c.tech?fmtText(c.tech):'Trainer schaut sich die Bilder an …'}</div>`:''}</section>`:'';
  const chat=coach.ai?`<section><h2>Frag den Trainer</h2>${c.chat.length?`<div class="chat">${c.chat.map((m,i)=>`<div class="bubble ${m.role}" ${i===c.chat.length-1?'id="lastbubble"':''}>${m.content?fmtText(m.content):'…'}</div>`).join('')}</div>`:'<p class="muted">Zum Beispiel: „Welches Double soll ich mir als Lieblings-Double nehmen?“ oder „Wie trainiere ich gegen die Nervosität bei Finishes?“</p>'}
    <div class="joinrow"><input id="coachq" placeholder="Deine Frage" autocomplete="off" aria-label="Frage an den Trainer" ${coach.chatBusy?'disabled':''}><button class="primary" data-act="coachask" ${coach.chatBusy?'disabled':''}>Senden</button></div></section>`:'';
  app.innerHTML=`<div class="wrap"><header class="gbar"><h1 class="gmode">Trainer</h1><button class="ghost" data-act="back">Zurück</button></header>${chips}
  <section><h2>Befunde für ${esc(coach.player)}</h2>${finds}</section>
  <section><h2>Beratung</h2>${ana}</section>
  <section><h2>Trainingseinheit</h2>${planHTML}<div class="addrow" style="margin-top:8px"><button class="ghost" data-act="coachlocal">${plan.length?'Schnellplan neu erstellen':'Schnellplan erstellen'}</button></div>${fb}</section>
  ${tech}${chat}</div>`;
}
function buildCoachPrompt(){
  return `Du bist ein erfahrener, freundlicher Darts-Trainer in der App „Pfeilerl“. Analysiere die Statistik von ${coach.player} und gib konkrete Beratung.
Regeln:
- Antworte auf Deutsch, per du, klar und konkret, ohne Floskeln.
- Du siehst nur Zahlen, nicht die Wurftechnik. Formuliere Technik-Hinweise als wahrscheinliche Ursachen, die die Daten nahelegen, und sag, woran man es selbst prüfen kann.
- Begründe Aussagen mit Werten aus den Daten. Fehlen Daten, sag, welche Spiele mehr Aussagekraft bringen.
- Ziele sind messbar und realistisch, leicht über dem aktuellen Niveau.
- Der Trainingsplan nutzt nur diese Übungen der App (Schlüssel und erlaubte Optionen):
${modeCatalog()}

Daten (JSON):
${JSON.stringify(coach.data)}

Vorläufige Befunde der App:
${coach.F.map(f=>'- '+f.t+': '+f.d).join('\n')||'- keine'}

Antworte ausschließlich mit JSON in genau dieser Form:
{"diagnose":"2 bis 4 Sätze","staerken":["kurz"],"baustellen":["kurz"],"technik":[{"titel":"kurz","text":"2 bis 3 Sätze mit Prüf-Tipp"}],"plan":[{"mode":"schlüssel","opts":{},"ziel":"messbares Ziel","warum":"1 Satz"}]}
staerken und baustellen je 1 bis 3 Einträge, technik 2 bis 3, plan 3 bis 5 Übungen in sinnvoller Reihenfolge, Aufwärmen zuerst.`;
}
async function coachAI(){
  const s=await getSample();if(!s) return;
  coach.busy='analyse';coach.err='';coach.ctl=new AbortController();renderCoach();
  try{
    const r=await s.json(buildCoachPrompt(),{signal:coach.ctl.signal,modelTier:'default'});
    const arr=v=>(Array.isArray(v)?v:[]).map(String).slice(0,3),c=cd();
    c.analysis={diagnose:String(r&&r.diagnose||''),staerken:arr(r&&r.staerken),baustellen:arr(r&&r.baustellen),technik:(Array.isArray(r&&r.technik)?r.technik:[]).slice(0,3).map(t=>({titel:String(t.titel||''),text:String(t.text||'')})),ts:Date.now()};
    const plan=sanitizePlan(r&&r.plan);
    if(plan.length){c.plan=plan;c.feedback='';}
    saveCoach();
  }catch(e){if(!e||e.code!=='cancelled') coach.err=errText(e);}
  coach.busy='';coach.ctl=null;
  if(onCoach()) renderCoach();
}
async function coachFeedback(){
  const s=await getSample();if(!s) return;
  const c=cd();coach.fbBusy=true;c.feedback='';renderCoach();
  const prompt=`Du bist Darts-Trainer. ${coach.player} hat diese Trainingseinheit absolviert. Gib ein kurzes, ehrliches Feedback in 4 bis 6 Sätzen, per du, auf Deutsch, ohne Überschriften: Was lief gut, wo wurde das Ziel verfehlt, und was ist der Fokus für die nächste Einheit.

Einheit:
${JSON.stringify(c.plan.map(d=>({uebung:MODES[d.mode].name,regeln:MODES[d.mode].sub(d.opts),ziel:d.ziel,ergebnis:d.result||'nicht gespielt'})))}

Aktuelle Kennzahlen:
${JSON.stringify(coach.data)}`;
  try{
    await s(prompt,{cache:false,onText:({text})=>{c.feedback=text;const el=document.getElementById('coachfb');if(el) el.innerHTML=fmtText(text);}});
    saveCoach();
  }catch(e){c.feedback=e&&e.text?e.text:'';coach.err=e&&e.code!=='cancelled'?errText(e):'';}
  coach.fbBusy=false;if(onCoach()) renderCoach();
}
async function coachAsk(){
  const inp=document.getElementById('coachq'),q=(inp&&inp.value||'').trim();
  if(!q||coach.chatBusy) return;
  const s=await getSample();if(!s) return;
  const c=cd();c.chat.push({role:'user',content:q});c.chat=c.chat.slice(-20);
  const msgs=c.chat.slice(-10).map(m=>({role:m.role,content:m.content}));
  while(msgs.length&&msgs[0].role!=='user') msgs.shift();
  const ctx=`Du bist ein erfahrener Darts-Trainer in der App „Pfeilerl“ und berätst ${coach.player}. Antworte auf Deutsch, per du, konkret und kurz, höchstens 6 Sätze, ohne Überschriften. Du siehst nur die Statistik, nicht die Technik. Empfiehlst du eine Übung, nenne eine aus der App: ${Object.values(MODES).map(m=>m.name).join(', ')}.

Statistik (JSON): ${JSON.stringify(coach.data)}
Befunde: ${coach.F.map(f=>f.t).join('; ')||'keine'}
${c.analysis?'Deine letzte Analyse: '+c.analysis.diagnose:''}

Frage: `;
  msgs[0]={role:'user',content:ctx+msgs[0].content};
  c.chat.push({role:'assistant',content:''});coach.chatBusy=true;renderCoach();
  const last=c.chat[c.chat.length-1];
  try{
    await s(msgs,{cache:false,onText:({text})=>{last.content=text;const el=document.getElementById('lastbubble');if(el) el.innerHTML=fmtText(text);}});
  }catch(e){last.content=(e&&e.text)||errText(e);}
  coach.chatBusy=false;saveCoach();
  if(onCoach()){renderCoach();const el=document.getElementById('coachq');if(el) el.focus();}
}
function shrinkImg(file,max){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(img.src);cv.toBlob(b=>b?res(b):rej(new Error('blob')),'image/jpeg',0.85);};
    img.onerror=()=>rej(new Error('img'));img.src=URL.createObjectURL(file);
  });
}
async function videoFrames(file,n){
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=URL.createObjectURL(file);
  await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});
  const vw=v.videoWidth||960,vh=v.videoHeight||540,W=Math.min(960,vw),H=Math.round(W*vh/vw),cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const x=cv.getContext('2d'),out=[];
  for(let i=0;i<n;i++){
    const t=v.duration*(0.1+0.8*i/Math.max(1,n-1));
    await new Promise(r=>{v.onseeked=r;v.currentTime=t;});
    x.drawImage(v,0,0,W,H);
    out.push(await new Promise(r=>cv.toBlob(r,'image/jpeg',0.82)));
  }
  URL.revokeObjectURL(v.src);
  return out.filter(Boolean);
}
async function techCheck(file){
  const s=await getSample();if(!s||!file) return;
  const c=cd();coach.techBusy=true;c.tech='';renderCoach();
  try{
    const imgs=file.type.startsWith('video/')?await videoFrames(file,Math.min(coach.imgMax||4,6)):[await shrinkImg(file,1280)];
    const multi=imgs.length>1;
    const prompt=`Du bist ein erfahrener Darts-Trainer. ${multi?`Die ${imgs.length} Bilder sind Einzelbilder aus einem Video in zeitlicher Reihenfolge und zeigen`:'Das Bild zeigt'} ${coach.player} beim Dartwurf. Beurteile, soweit erkennbar: Stand und Fußstellung, Gewichtsverteilung, Oberkörper und Schulter, Ellbogen und Wurfarm, Griff, Abwurf und Follow-through. Nenne zuerst, was gut aussieht, dann die zwei bis drei wichtigsten Änderungen, jeweils mit einer konkreten Übung. Was auf den Bildern nicht erkennbar ist, sagst du ehrlich, statt zu raten.${coach.F.length?' Die Statistik zeigt außerdem: '+coach.F.map(f=>f.t+' ('+f.d+')').join(' '):''} Antworte auf Deutsch, per du, in kurzen Absätzen ohne Überschriften.`;
    await s(prompt,{images:imgs,cache:false,onText:({text})=>{c.tech=text;const el=document.getElementById('techout');if(el) el.innerHTML=fmtText(text);}});
  }catch(e){c.tech=e&&e.code==='image_rejected'?'Dieses Format wurde nicht angenommen. Bitte ein Foto als JPG oder PNG oder ein kürzeres Video wählen.':(e&&e.text)||(e&&e.code?errText(e):'Die Datei ließ sich nicht lesen. Bitte ein anderes Foto oder Video probieren.');}
  coach.techBusy=false;saveCoach();
  if(onCoach()) renderCoach();
}
function startDrill(i){
  const d=cd().plan[i];if(!d) return;
  const sp=setup.players.find(x=>(x.name||'').trim()===coach.player)||{};
  startGame(false,{mode:d.mode,opts:clone(d.opts),players:[{name:coach.player,bot:0,nick:sp.nick||'',jingle:sp.jingle||'fanfare',aid:sp.aid||'',set:sp.set?setLabel(sp.set):''}],tour:null,drill:{i,player:coach.player}});
  window.scrollTo(0,0);
}
function drillDone(g,undoIt){
  if(!g.drill) return;
  const c=coachData[g.drill.player],d=c&&c.plan[g.drill.i];if(!d) return;
  if(undoIt){d.done=false;d.result='';}
  else{const st=MODES[g.mode].stats(g)[0];d.done=true;d.result=st?st[1]:'';c.feedback='';}
  saveCoach();
}
const toCoach=()=>endGame('coach');
function coachClick(t){
  const a=t.dataset.act;coach.err='';
  if(a==='coach'){openCoach();return;}
  if(t.dataset.cplayer!==undefined){coach.player=t.dataset.cplayer;renderCoach();return;}
  if(a==='coachai'){coachAI();return;}
  if(a==='coachstop'){if(coach.ctl) coach.ctl.abort();return;}
  if(a==='coachlocal'){const c=cd();c.plan=localPlan(entriesFor(coach.recs,coach.player));c.feedback='';saveCoach();renderCoach();return;}
  if(a==='coachfb'){coachFeedback();return;}
  if(a==='coachask'){coachAsk();return;}
  if(t.dataset.drill!==undefined) startDrill(+t.dataset.drill);
}

/* ---------- Einlauf, Jingles ---------- */
let actx=null;
const ac=()=>actx||(actx=new (window.AudioContext||window.webkitAudioContext)());
const NOTE=n=>440*Math.pow(2,(n-69)/12);
function tone(c,d,type,f,t0,dur,vol){const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f,t0);g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(vol,t0+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);o.connect(g);g.connect(d);o.start(t0);o.stop(t0+dur+0.05);}
function noiseHit(c,d,t0,dur,vol,hp){const b=c.createBuffer(1,Math.max(1,Math.floor(c.sampleRate*dur)),c.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++) a[i]=Math.random()*2-1;const s=c.createBufferSource();s.buffer=b;const f=c.createBiquadFilter();f.type='highpass';f.frequency.value=hp;const g=c.createGain();g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);s.connect(f);f.connect(g);g.connect(d);s.start(t0);}
function kick(c,d,t0,vol){const o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(140,t0);o.frequency.exponentialRampToValueAtTime(40,t0+0.25);g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(0.0001,t0+0.3);o.connect(g);g.connect(d);o.start(t0);o.stop(t0+0.35);}
const JINGLES={
  fanfare:{n:'Fanfare',play(c,d,t){[[60,0],[64,.18],[67,.36],[72,.54]].forEach(([m,o])=>tone(c,d,'sawtooth',NOTE(m),t+o,.3,.12));[60,64,67,72].forEach(m=>tone(c,d,'sawtooth',NOTE(m),t+.8,1.6,.07));kick(c,d,t+.8,.6);noiseHit(c,d,t+.8,1.2,.12,5000);}},
  arena:{n:'Arena',play(c,d,t){for(let i=0;i<4;i++) kick(c,d,t+i*.45,.7);[[48,55,60],[50,57,62],[52,59,64]].forEach((ch,i)=>ch.forEach(m=>tone(c,d,'sawtooth',NOTE(m),t+i*.45,.42,.05)));[55,62,67,71].forEach(m=>tone(c,d,'sawtooth',NOTE(m),t+1.35,1.6,.06));noiseHit(c,d,t+1.35,1.4,.15,4000);}},
  retro:{n:'8-Bit',play(c,d,t){[72,76,79,84,79,84,88].forEach((m,i)=>tone(c,d,'square',NOTE(m),t+i*.13,.12,.08));tone(c,d,'square',NOTE(91),t+.95,.8,.07);tone(c,d,'triangle',NOTE(48),t+.95,.8,.15);}},
  wirbel:{n:'Trommelwirbel',play(c,d,t){let o=0;for(let i=0;i<26;i++){noiseHit(c,d,t+o,.06,.18,1800);o+=Math.max(.035,.11-i*.004);}kick(c,d,t+o,.8);noiseHit(c,d,t+o,1.5,.2,5000);[60,67,72].forEach(m=>tone(c,d,'sawtooth',NOTE(m),t+o,1.2,.06));}},
  horn:{n:'Stadionhorn',play(c,d,t){[0,.7].forEach(off=>{const o=c.createOscillator(),g=c.createGain(),l=c.createOscillator(),lg=c.createGain();o.type='sawtooth';o.frequency.value=NOTE(46);l.frequency.value=5;lg.gain.value=3;l.connect(lg);lg.connect(o.frequency);g.gain.setValueAtTime(.0001,t+off);g.gain.exponentialRampToValueAtTime(.14,t+off+.05);g.gain.setValueAtTime(.14,t+off+.5);g.gain.exponentialRampToValueAtTime(.0001,t+off+.65);o.connect(g);g.connect(d);o.start(t+off);l.start(t+off);o.stop(t+off+.7);l.stop(t+off+.7);});[58,62,65].forEach(m=>tone(c,d,'sawtooth',NOTE(m),t+1.5,1.2,.06));kick(c,d,t+1.5,.6);}},
  robot:{n:'Roboter',play(c,d,t){for(let i=0;i<8;i++) tone(c,d,'square',200+Math.random()*900,t+i*.1,.08,.06);tone(c,d,'sine',NOTE(84),t+1,.6,.12);tone(c,d,'sine',NOTE(79),t+1.2,.8,.1);}}
};
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open('pfeilerl',1);r.onupgradeneeded=()=>r.result.createObjectStore('audio');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function audioPut(key,blob){try{const db=await idbOpen();await new Promise((res,rej)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(blob,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});return true;}catch(e){return false;}}
async function audioGet(key){try{const db=await idbOpen();return await new Promise(res=>{const r=db.transaction('audio','readonly').objectStore('audio').get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);});}catch(e){return null;}}
async function playJingle(p){
  if(p.jingle==='file'&&p.aid){
    const blob=await audioGet(p.aid);
    if(blob){
      const a=new Audio(URL.createObjectURL(blob));a.volume=1;a.play().catch(()=>{});
      return ()=>{let v=1;const iv=setInterval(()=>{v-=0.1;if(v<=0){clearInterval(iv);a.pause();URL.revokeObjectURL(a.src);}else a.volume=v;},60);};
    }
  }
  try{
    const c=ac();if(c.resume) c.resume();
    const g=c.createGain();g.connect(c.destination);
    (JINGLES[p.jingle]||JINGLES[p.bot?'robot':'fanfare']).play(c,g,c.currentTime+0.05);
    return ()=>{try{g.gain.setTargetAtTime(0.0001,c.currentTime,0.25);setTimeout(()=>g.disconnect(),1200);}catch(e){}};
  }catch(e){return ()=>{};}
}
function speakNow(t){
  return new Promise(res=>{
    if(!window.speechSynthesis){setTimeout(res,1500);return;}
    try{
      speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(t);u.lang='de-DE';u.rate=0.95;
      const v=speechSynthesis.getVoices().find(v=>v.lang&&v.lang.toLowerCase().startsWith('de'));if(v) u.voice=v;
      let done=false;const fin=()=>{if(!done){done=true;res();}};
      u.onend=fin;u.onerror=fin;setTimeout(fin,7000);
      speechSynthesis.speak(u);
    }catch(e){res();}
  });
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const intro={running:false,cancel:false,stop:null};
function introEl(){
  let el=document.getElementById('introov');
  if(!el){el=document.createElement('div');el.id='introov';el.className='introov';el.hidden=true;document.body.appendChild(el);
    el.addEventListener('click',e=>{if(e.target.closest('button')){intro.cancel=true;if(intro.stop) intro.stop();if(window.speechSynthesis) try{speechSynthesis.cancel();}catch(x){}}});}
  return el;
}
async function playIntro(players){
  if(intro.running||!players.length) return;
  intro.running=true;intro.cancel=false;
  const el=introEl();el.hidden=false;
  for(let i=0;i<players.length&&!intro.cancel;i++){
    const p=players[i];
    el.innerHTML=`<div class="introcard"><span class="introk">${i===0?'Es betritt die Bühne':'Und jetzt'}</span><b>${esc(p.name)}</b>${p.nick?`<em>„${esc(p.nick)}“</em>`:''}<button class="ghost">Überspringen</button></div>`;
    intro.stop=await playJingle(p);
    await sleep(1100);
    if(intro.cancel) break;
    const who=p.nick?`${p.name}, ${p.nick}!`:`${p.name}!`;
    await speakNow(i===0?`Meine Damen und Herren, es betritt die Bühne: ${who}`:`Und jetzt: ${who}`);
    await sleep(p.jingle==='file'?2500:700);
    if(intro.stop) intro.stop();
  }
  intro.stop=null;intro.running=false;el.hidden=true;el.innerHTML='';
}
async function winJingle(p){const st=await playJingle(p);setTimeout(st,4000);}

/* ---------- Großer Bildschirm ---------- */
let scr=null;
const tv={code:'',g:null,unsub:null,err:''};
const onTV=()=>!!document.querySelector('.tv');
async function tvButton(){
  const info=document.getElementById('camstat');
  const show=t=>{if(info){info.hidden=false;info.textContent=t;}};
  const db=await getDbNs();
  if(!db){show('Der große Bildschirm funktioniert in der Pfeilerl-Version auf claude.ai.');return;}
  if(!game) return;
  const code=game.online||game.screen||(()=>{const c=Array.from({length:5},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');scr={code:c};game.screen=c;saveGame();return c;})();
  show(`Bildschirm-Code ${code}: Öffne Pfeilerl auf Fernseher oder PC, tippe auf „Bildschirm“ und gib den Code ein.`);
  update();
}
const hasClaude=()=>!!(window.claude&&typeof window.claude.use==='function');
function renderTVJoin(){
  app.innerHTML=`<div class="wrap"><header class="gbar"><h1 class="gmode">Bildschirm</h1><button class="ghost" data-act="back">Zurück</button></header>
  ${tv.err?`<p class="err" role="alert">${esc(tv.err)}</p>`:''}
  <p class="muted">Dieses Gerät wird zur großen Anzeige, etwa am Fernseher oder PC. Am Handy startest du das Spiel wie gewohnt und tippst oben auf 📺. Den angezeigten Code gibst du hier ein.</p>
  ${hasClaude()?`<div class="joinrow"><input id="tvcode" maxlength="5" placeholder="Code" autocapitalize="characters" autocomplete="off" aria-label="Bildschirm-Code"><button class="primary" data-act="tvgo">Verbinden</button></div>`:'<p class="empty">Der große Bildschirm funktioniert in der Pfeilerl-Version auf claude.ai, weil dort der gemeinsame Spielstand gespeichert wird. In der installierten Version ist dieser Modus nicht verfügbar.</p>'}
  <p class="muted small" style="margin-top:12px">Ansage und Einlaufmusik spielen auf diesem Gerät, wenn du sie hier am Startbildschirm einschaltest. Eigene Musikdateien gibt es nur auf dem Gerät, auf dem sie gespeichert sind, sonst spielt die Fanfare.</p></div>`;
}
async function tvGo(){
  tv.err='';
  const code=((document.getElementById('tvcode')||{}).value||'').trim().toUpperCase();
  if(!validCode(code)){tv.err='Der Code besteht aus 5 Buchstaben oder Ziffern.';renderTVJoin();return;}
  const db=await getDbNs();
  if(!db){tv.err='Der große Bildschirm funktioniert in der Pfeilerl-Version auf claude.ai.';renderTVJoin();return;}
  tv.code=code;tv.g=null;
  if(tv.unsub) try{tv.unsub();}catch(e){}
  tv.unsub=db.doc('online/'+code).onSnapshot(snap=>{
    if(!snap.exists){if(onTV()) renderTV();return;}
    let st;try{st=untrusted(JSON.parse(snap.data().state));}catch(e){return;}
    if(!st||!validGame(st.g)) return;
    const prev=tv.g;tv.g=st.g;
    tvAnnounce(prev,tv.g);
    if(onTV()) renderTV();
  },()=>{tv.err='Verbindung zum Spiel unterbrochen.';});
  renderTV();
}
function tvLeave(){if(tv.unsub) try{tv.unsub();}catch(e){}tv.unsub=null;tv.g=null;}
function tvAnnounce(prev,g){
  if(!g) return;
  const fresh=g.players.every(p=>!p.darts);
  if((prev&&prev.gid!==g.gid)||(!prev&&fresh)){if(setup.walkon) playIntro(g.players);return;}
  if(!prev) return;
  if(!prev.winner&&g.winner){say(winCall(g));if(setup.walkon&&g.winner.length===1) winJingle(g.players[g.winner[0]]);return;}
  if((!prev.locked&&g.locked)||(!prev.legDone&&g.legDone)){say(visitCall(g,g.players[g.cur]));return;}
  if(prev.cur!==g.cur&&!g.winner) say(promptCall(g));
}
function renderTV(){
  const g=tv.g;
  const bar=`<header class="tvbar"><div class="brand tvbrand">${LOGO}<span>Pfeilerl</span></div><div class="tvmode">${g?esc(MODES[g.mode].name+', '+MODES[g.mode].sub(g.opts)):'Code '+esc(tv.code)}</div><div class="gtools"><button class="ghost" data-act="tvfull">Vollbild</button><button class="ghost" data-act="back">Trennen</button></div></header>`;
  if(!g){app.innerHTML=`<div class="tv">${bar}<div class="tvwait">Warte auf das Spiel mit Code ${esc(tv.code)} …</div></div>`;return;}
  const m=MODES[g.mode],p=g.players[g.cur];
  const slots=[0,1,2].map(i=>{const d=g.visit[i];return d?`<div class="tslot f ${d.mult===3?'t':d.mult===2?'d':''}">${label(d)}</div>`:'<div class="tslot"></div>';}).join('');
  const sum=g.visit.reduce((a,d)=>a+val(d),0);
  let head,sub='';
  if(g.winner){head=g.winner.map(i=>esc(g.players[i].name)).join(' und ')+(g.winner.length>1?' unentschieden':' gewinnt');sub=esc(g.msg||'');}
  else{head=esc(p.name);sub=g.legDone?esc(g.msg):g.bust?'Überworfen':esc(m.hint(g,p)||'');}
  if(g.winner) confetti('tv'+g.gid+':'+g.winner.join(','));
  app.innerHTML=`<div class="tv">${bar}<div class="tvmain"><section class="tvscore">${m.board(g)}</section>
  <aside class="tvturn ${g.winner?'win':''}"><span class="tvk">${g.winner?'Spiel vorbei':'Am Wurf'}</span><div class="tvwho">${head}</div><div class="tvvisit">${slots}</div><div class="tvsum">${g.visit.length?sum:''}</div><div class="tvhint">${sub}</div></aside></div></div>`;
}

/* ---------- Dart-Sets ---------- */
const setLabelS=s=>s.name+(s.w?` (${String(s.w).replace('.',',')} g)`:'');
const setLabel=id=>{const s=(setup.sets||[]).find(x=>x.id===id);return s?setLabelS(s):'';};
function setsCompare(es){
  const groups={};es.forEach(e=>{if(e.set) (groups[e.set]=groups[e.set]||[]).push(e);});
  const names=Object.keys(groups);if(!names.length) return null;
  return names.map(n=>{
    const g=groups[n],x=X(g),a=x.length?agg(x,'x01'):null,c=g.filter(e=>e.mode==='cricket'),hm={};
    g.filter(e=>e.mode==='x01'||e.mode==='score100').forEach(e=>{for(const k in (e.hm||{})) hm[k]=(hm[k]||0)+e.hm[k];});
    const h=k=>hm[k]||0,t20=h('T20'),tot=t20+h('S20')+h('D20')+h('S1')+h('T1')+h('D1')+h('S5')+h('T5')+h('D5');
    return {set:n,spiele:g.length,avg:a?a.avg:null,coq:a?a.coq:null,t20:tot>=20?t20/tot*100:null,mpr:c.length?agg(c,'cricket').mpr:null};
  }).sort((a,b)=>(b.avg||0)-(a.avg||0));
}
function setsHTML(es){
  const rows=setsCompare(es);if(!rows) return '';
  const f=(v,p)=>v==null?'–':p?Math.round(v)+' %':fmt(v);
  return `<section><h2>Dart-Sets im Vergleich</h2><div class="tw"><table class="rank"><thead><tr><th>Set</th><th>Spiele</th><th>Ø X01</th><th>Doppel</th><th>T20</th><th>MPR</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${esc(r.set)}</th><td>${r.spiele}</td><td>${f(r.avg)}</td><td>${f(r.coq,1)}</td><td>${f(r.t20,1)}</td><td>${f(r.mpr)}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Für einen fairen Vergleich je Set mindestens 5 Spiele werfen. T20 zeigt den Anteil Triple rund um die 20.</p></section>`;
}

function profPanel(pl,i){
  return `<li class="profpanel"><div class="profbox">
  <label class="olabel" for="nick${i}">Spitzname für die Ansage</label><input id="nick${i}" class="pinput" data-nick="${i}" value="${esc(pl.nick||'')}" maxlength="24" placeholder="z. B. The Rocket">
  <span class="olabel">Einlauf-Jingle</span><div class="seg" role="group" aria-label="Jingle">${Object.entries(JINGLES).filter(([k])=>k!=='robot').map(([k,j])=>`<button data-jg="${i}:${k}" class="${(pl.jingle||'fanfare')===k?'on':''}" aria-pressed="${(pl.jingle||'fanfare')===k}">${j.n}</button>`).join('')}${pl.aid?`<button data-jg="${i}:file" class="${pl.jingle==='file'?'on':''}" aria-pressed="${pl.jingle==='file'}">Eigene Musik</button>`:''}</div>
  <label class="ghost filebtn">${pl.aid?'Andere Musikdatei wählen':'Eigene Musikdatei wählen'}<input type="file" accept="audio/*" data-pf="${i}" class="vh"></label>
  <label class="olabel" for="pset${i}">Dart-Set</label><select id="pset${i}" class="pinput" data-pset="${i}"><option value="">Kein Set</option>${setup.sets.map(st=>`<option value="${st.id}" ${pl.set===st.id?'selected':''}>${esc(setLabelS(st))}</option>`).join('')}</select>
  <div class="addrow"><button class="ghost" data-preview="${i}">Einlauf anhören</button><button class="primary sm" data-prof="${i}">Fertig</button></div></div></li>`;
}
async function profFile(i,file){
  const pl=setup.players[i];if(!pl) return;
  if(file.size>10*1024*1024){setupErr='Die Musikdatei ist zu groß, bitte höchstens 10 MB.';renderSetup();return;}
  const aid=pl.aid||newId();
  if(await audioPut(aid,file)){pl.aid=aid;pl.jingle='file';setupErr='';}else setupErr='Die Musik ließ sich auf diesem Gerät nicht speichern.';
  saveSetup();renderSetup();
}
function profClick(t){
  const a=t.dataset.act;
  if(t.dataset.prof!==undefined){const i=+t.dataset.prof;setupProf=setupProf===i?-1:i;renderSetup();return;}
  if(t.dataset.jg){const [i,k]=t.dataset.jg.split(':');setup.players[+i].jingle=k;saveSetup();renderSetup();playJingle(setup.players[+i]).then(st=>setTimeout(st,3000));return;}
  if(t.dataset.preview!==undefined){const pl=setup.players[+t.dataset.preview];playIntro([{name:(pl.name||'').trim()||'Spieler',nick:pl.nick||'',jingle:pl.jingle||'fanfare',aid:pl.aid||''}]);return;}
  if(t.dataset.walk!==undefined){setup.walkon=t.dataset.walk==='1';saveSetup();renderSetup();return;}
  if(a==='addset'){
    const n=(document.getElementById('setname').value||'').trim(),w=parseFloat((document.getElementById('setw').value||'').replace(',','.'));
    const wRaw=(document.getElementById('setw').value||'').trim();setDraft={n,w:wRaw};
    if(!n){moreErr={where:'sets',text:'Bitte einen Namen für das Set eingeben.'};setupMore=true;renderSetup();return;}
    if(wRaw&&!(isFinite(w)&&w>=10&&w<=60)){moreErr={where:'sets',text:'Das Gewicht bitte in Gramm zwischen 10 und 60 angeben, z. B. 22 oder 23,5.'};setupMore=true;renderSetup();return;}
    if(setup.sets.some(x=>x.name.toLowerCase()===n.toLowerCase())){moreErr={where:'sets',text:`Ein Set „${n}“ gibt es schon.`};setupMore=true;renderSetup();return;}
    setup.sets.push({id:newId(),name:n,w:wRaw?Math.round(w*10)/10:0});setDraft={n:'',w:''};saveSetup();setupMore=true;renderSetup();return;
  }
  if(t.dataset.delset){const id=t.dataset.delset;setup.sets=setup.sets.filter(x=>x.id!==id);setup.players.forEach(p=>{if(p.set===id) p.set='';});saveSetup();renderSetup();}
}
function tvClick(t){
  const a=t.dataset.act;
  if(a==='tv'){tv.err='';renderTVJoin();window.scrollTo(0,0);return;}
  if(a==='tvgo'){tvGo();return;}
  if(a==='tvfull'){const el=document.documentElement;try{if(document.fullscreenElement) document.exitFullscreen();else if(el.requestFullscreen) el.requestFullscreen().catch(()=>{});}catch(e){}}
}
/* ---------- Ereignisse im Setup ---------- */
app.addEventListener('click',e=>{
  if(game) return;
  if(e.target.id==='calcv'){calClick(e);return;}
  const t=e.target.closest('button');if(!t||t.disabled) return;
  if(['tv','tvgo','tvfull'].includes(t.dataset.act)){tvClick(t);return;}
  if(t.dataset.prof!==undefined||t.dataset.jg||t.dataset.preview!==undefined||t.dataset.delset||t.dataset.walk!==undefined||t.dataset.act==='addset'){profClick(t);return;}
  if(['coach','coachai','coachstop','coachlocal','coachfb','coachask'].includes(t.dataset.act)||t.dataset.drill!==undefined||t.dataset.cplayer!==undefined){coachClick(t);return;}
  if(['online','onlcreate','onljoin'].includes(t.dataset.act)||t.dataset.oseat!==undefined||t.dataset.ojseat!==undefined){onlClick(t);return;}
  if(['cam','camscan','camtoggle','calsnap','calundo','calcancel','calsave','calreset','camdiag','camref'].includes(t.dataset.act)||t.dataset.cal!==undefined||t.dataset.sens!==undefined||t.dataset.thr!==undefined||t.dataset.mg!==undefined||t.dataset.cres!==undefined||t.dataset.cfps!==undefined||t.dataset.cspeed!==undefined||t.dataset.cstby!==undefined||t.dataset.ccheck!==undefined){camClick(t);return;}
  if(['tour','tourstart','tourend'].includes(t.dataset.act)||t.dataset.tf||t.dataset.play){tourClick(t);return;}
  if(t.dataset.act==='stats'||t.dataset.act==='back'||t.dataset.smode||t.dataset.splayer!==undefined||t.dataset.del||t.dataset.train!==undefined){statsClick(t);return;}
  if(t.dataset.mode){setup.mode=t.dataset.mode;setupErr='';saveSetup();renderSetup();return;}
  if(t.dataset.theme!==undefined){setup.theme=['auto','light','dark'][+t.dataset.theme];saveSetup();applyTheme();renderSetup();return;}
  if(t.dataset.reg!==undefined){addRegular(t.dataset.reg);setupErr='';saveSetup();renderSetup();return;}
  if(t.dataset.delreg!==undefined){setup.regulars=setup.regulars.filter(r=>r.name!==t.dataset.delreg);saveSetup();renderSetup();return;}
  if(t.dataset.opt){const op=MODES[setup.mode].options.find(o=>o.key===t.dataset.opt);setup.opts[setup.mode][op.key]=op.choices[+t.dataset.ci][0];saveSetup();renderSetup();return;}
  if(t.dataset.voice!==undefined){setup.voice=t.dataset.voice==='1';saveSetup();renderSetup();if(setup.voice) say('Ansage an');return;}
  if(t.dataset.bl!==undefined){const pl=setup.players[+t.dataset.bl];pl.bot=+t.dataset.lv;pl.name=uniqueBotName(pl.bot,+t.dataset.bl);saveSetup();renderSetup();return;}
  if(t.dataset.rm!==undefined){setup.players.splice(+t.dataset.rm,1);saveSetup();renderSetup();return;}
  const a=t.dataset.act;
  if(a==='add'){setup.players.push({name:'Spieler '+(setup.players.length+1)});setupErr='';saveSetup();renderSetup();
    const ins=app.querySelectorAll('.players input');const last=ins[ins.length-1];if(last){last.focus();last.select();}return;}
  if(a==='addbot'){setup.players.push({name:uniqueBotName(2,-1),bot:2});setupErr='';saveSetup();renderSetup();return;}
  if(a==='modesall'||a==='modesless'){setupAll=a==='modesall';renderSetup();return;}
  if(a==='backup'){backupData();return;}
  if(a==='start'){startGame(false);window.scrollTo(0,0);return;}
  if(a==='resume'){startGame(true);window.scrollTo(0,0);}
});
app.addEventListener('change',e=>{
  if(e.target.id==='smode'){sv.mode=e.target.value;sv.armed=null;drawStats();}
  if(e.target.dataset.camdev!==undefined){camDevChange(e.target);return;}
  if(e.target.id==='techfile'&&e.target.files&&e.target.files[0]) techCheck(e.target.files[0]);
  if(e.target.id==='restore'&&e.target.files&&e.target.files[0]) restoreFile(e.target.files[0]);
  if(e.target.dataset.pset!==undefined){setup.players[+e.target.dataset.pset].set=e.target.value||'';saveSetup();}
  if(e.target.dataset.pf!==undefined&&e.target.files&&e.target.files[0]) profFile(+e.target.dataset.pf,e.target.files[0]);
});
app.addEventListener('toggle',e=>{if(e.target.id==='more') setupMore=e.target.open;},true);
app.addEventListener('keydown',e=>{if(e.target.id==='coachq'&&e.key==='Enter'){e.preventDefault();coachAsk();}});
app.addEventListener('input',e=>{
  if(!game&&e.target.dataset.nick!==undefined){setup.players[+e.target.dataset.nick].nick=e.target.value;saveSetup();return;}
  if(game||e.target.dataset.pi===undefined) return;
  setup.players[+e.target.dataset.pi].name=e.target.value;saveSetup();
});

/* ---------- Update-Hinweis ---------- */
window.pfeilerlUpdate=()=>{
  if(document.getElementById('upd')) return;
  const d=document.createElement('div');d.id='upd';d.className='upd';d.setAttribute('role','status');
  d.innerHTML=`<span><b>Neue Version von Pfeilerl</b><small>${game?'Dein laufendes Spiel bleibt erhalten.':'Kurz neu laden, dann ist sie aktiv.'}</small></span><button class="primary sm" id="updgo">Aktualisieren</button><button class="icon" id="updx" aria-label="Später">✕</button>`;
  document.body.appendChild(d);
  document.getElementById('updgo').onclick=()=>location.reload();
  document.getElementById('updx').onclick=()=>d.remove();
};

if(typeof window.__pfeilerlTest==='function') window.__pfeilerlTest({MODES,CATS,checkout,classify,fitCal,triangulate,startGame,throwDart,nextVisit,undo,getGame:()=>game,setup,loadRecords,onlClick,tvClick,profClick,coachClick,drawStats,sv,newAchievements,gameKey,VERSION,dupName,camErrText,CAM_MODES,fitH,projH,invH,isAngled,findTip,locate,ncc,untrusted,validGame,validCode,mergeBackup,quickModes,rememberPlayers,addRegular,localRecs,getOnl:()=>onl,getTv:()=>tv,els:null});
applyTheme();
renderSetup();
})();
