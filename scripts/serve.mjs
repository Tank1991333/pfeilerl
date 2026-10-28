// Kleiner lokaler Server für public/, also genau das, was Vercel veröffentlicht (vorher npm run build).
// Kamera und Service Worker brauchen http://localhost oder https. Standardmäßig nur auf diesem Rechner
// erreichbar; mit HOST=0.0.0.0 auch im WLAN, etwa zum Testen am Handy.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const root=resolve('public');
const port=process.env.PORT||8080,host=process.env.HOST||'127.0.0.1';
createServer(async(req,res)=>{
  const fail=(code,text)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);};
  let p;
  try{p=decodeURIComponent(new URL(req.url,'http://x').pathname);}catch{return fail(400,'Ungültige Adresse');}
  if(p.endsWith('/')) p+='index.html';
  const file=resolve(root,'.'+p);
  // nur Dateien in public/, keine versteckten Dateien
  if(!file.startsWith(root+sep)||file.split(sep).some(x=>x.startsWith('.'))) return fail(404,'Nicht gefunden');
  try{const b=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(b);}
  catch{fail(404,'Nicht gefunden');}
}).listen(port,host,()=>console.log(`Pfeilerl läuft auf http://localhost:${port}`));
