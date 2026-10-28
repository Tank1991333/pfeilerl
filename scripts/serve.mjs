// Kleiner lokaler Server für die gebaute Seite im Hauptordner (Kamera und Service Worker brauchen http://localhost oder https)
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const port=process.env.PORT||8080;
createServer(async(req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p.endsWith('/')) p+='index.html';
  const file=join('.',normalize(p).replace(/^(\.\.[/\\])+/,''));
  try{const b=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(b);}
  catch{res.writeHead(404);res.end('Nicht gefunden');}
}).listen(port,()=>console.log(`Pfeilerl läuft auf http://localhost:${port}`));
