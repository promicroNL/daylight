import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const assets={'/':'index.html','/app.js':'app.js','/metrics.js':'metrics.js','/model.js':'model.js','/style.css':'style.css','/data.json':'data.json'};
http.createServer((req,res)=>{let file=assets[req.url?.split('?')[0]];if(!file){res.writeHead(404);return res.end('Not found');}try{let body=fs.readFileSync(path.join(root,file));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/json','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(body);}catch{res.writeHead(503);res.end('Run node import.mjs .. in the dashboard folder first.');}}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Offline Fitbit: http://127.0.0.1:'+(process.env.PORT||4173)));
