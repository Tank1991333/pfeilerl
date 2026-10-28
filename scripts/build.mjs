// Baut aus src/ zwei Varianten:
//  index.html + sw.js im Hauptordner – installierbare PWA (GitHub Pages, Branch main, Ordner / (root))
//  public/                            – dieselbe Seite samt Manifest und Icons für Vercel (vercel.json)
//  dist/claude-artifact.html          – Einzeldatei für claude.ai (KI-Trainer, Online, Bildschirm)
// Manifest und Icons liegen direkt im Hauptordner und werden nicht verändert.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
const {version}=JSON.parse(readFileSync('package.json','utf8'));
const tpl=readFileSync('src/index.html','utf8');
const css=readFileSync('src/styles.css','utf8');
const js=readFileSync('src/app.js','utf8').replaceAll('__VERSION__',version);
const base=tpl.replace('/*STYLES*/',()=>css).replace('/*SCRIPT*/',()=>js);
const pwaHead=`<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#7B5CFF">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Pfeilerl">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png">`;
const pwaBody=`<script>
if('serviceWorker' in navigator){window.addEventListener('load',()=>{
  const had=!!navigator.serviceWorker.controller;let shown=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!shown){shown=true;if(window.pfeilerlUpdate) window.pfeilerlUpdate();}});
  navigator.serviceWorker.register('sw.js').then(reg=>{
    const check=()=>reg.update().catch(()=>{});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') check();});
    setInterval(check,30*60*1000);
  }).catch(()=>{});
});}
</script>`;
writeFileSync('index.html',base.replace('</title>','</title>\n'+pwaHead).replace('<!--PWA-->',pwaBody));
writeFileSync('sw.js',readFileSync('src/sw.js','utf8').replaceAll('__VERSION__',version));
rmSync('public',{recursive:true,force:true});mkdirSync('public');
for(const f of ['index.html','sw.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png']) copyFileSync(f,'public/'+f);
mkdirSync('dist',{recursive:true});
writeFileSync('dist/claude-artifact.html',base.replace('<!--PWA-->',''));
console.log(`Gebaut: Version ${version}, index.html und sw.js (PWA), public/ (Vercel) sowie dist/claude-artifact.html`);
