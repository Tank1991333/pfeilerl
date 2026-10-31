// Baut aus src/ zwei Varianten:
//  index.html + sw.js im Hauptordner – installierbare PWA (GitHub Pages, Branch main, Ordner / (root))
//  public/                            – dieselbe Seite samt Manifest, Icons und Schriften für Vercel (vercel.json)
// Die PWA nutzt die Schriften aus fonts/ (keine Anfragen an Google, DSGVO), die claude.ai-Fassung Google Fonts.
//  dist/claude-artifact.html          – Einzeldatei für claude.ai (KI-Trainer, Online, Bildschirm)
// Manifest und Icons liegen direkt im Hauptordner und werden nicht verändert.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,rmSync,readdirSync} from 'node:fs';
const {version,impressum}=JSON.parse(readFileSync('package.json','utf8'));
const tpl=readFileSync('src/index.html','utf8');
const css=readFileSync('src/styles.css','utf8');
// Kamera-Teil liegt in src/camera.js und wird an der Stelle /*CAMERA*/ eingesetzt
const js=readFileSync('src/app.js','utf8').replace('/*CAMERA*/',()=>readFileSync('src/camera.js','utf8')).replaceAll('__VERSION__',version).replace('/*IMPRESSUM*/{}',()=>JSON.stringify(impressum||{}));
const base=tpl.replace('/*STYLES*/',()=>css).replace('/*SCRIPT*/',()=>js);
const fontsCss=readFileSync('src/fonts.css','utf8');
const pwaFonts=`<link rel="preload" href="fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/barlow-condensed-700.woff2" as="font" type="font/woff2" crossorigin>
<style>
${fontsCss}</style>`;
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
const FONTS=/<!--FONTS-->[\s\S]*?<!--\/FONTS-->/;
writeFileSync('index.html',base.replace(FONTS,()=>pwaFonts).replace('</title>','</title>\n'+pwaHead).replace('<!--PWA-->',pwaBody));
writeFileSync('sw.js',readFileSync('src/sw.js','utf8').replaceAll('__VERSION__',version));
rmSync('public',{recursive:true,force:true});mkdirSync('public');
for(const f of ['index.html','sw.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png']) copyFileSync(f,'public/'+f);
mkdirSync('public/fonts');for(const f of readdirSync('fonts')) copyFileSync('fonts/'+f,'public/fonts/'+f);
mkdirSync('dist',{recursive:true});
writeFileSync('dist/claude-artifact.html',base.replace(FONTS,m=>m.slice(12,-13)).replace('<!--PWA-->',''));
console.log(`Gebaut: Version ${version}, index.html und sw.js (PWA), public/ (Vercel) sowie dist/claude-artifact.html`);
