import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {models,ratios,angles,modes,productList,promptFor,detectionPrompt,qcPrompt,qcReport,parseJson} from './public/core.js';
const MAX=24*1024*1024;
const textModel='gemini-3.5-flash-lite';
const allowedMime=['image/png','image/jpeg','image/webp'];
const assets={'/':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript'],'/core.js':['core.js','text/javascript']};
class HttpError extends Error {constructor(status,message){super(message);this.status=status}}
function fail(status,message){throw new HttpError(status,message)}
export function imagePart(i){
 if(!i||!allowedMime.includes(i.mimeType)||typeof i.base64!=='string'||!i.base64||i.base64.length>MAX||!/^[A-Za-z0-9+/]+={0,2}$/.test(i.base64)||i.base64.length%4!==0)fail(400,'Invalid image. Use JPEG, PNG or WebP.');
 const bytes=Buffer.from(i.base64,'base64');
 const valid=i.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):i.mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)fail(400,'Image content does not match MIME type.');
 return {inlineData:{mimeType:i.mimeType,data:i.base64}};
}
export async function gemini(model,parts,generationConfig,{key,fetcher=fetch,timeout=180000}={}){
 if(!key)fail(503,'No Gemini API key configured. Manual studio remains available.');
 const signal=AbortSignal.timeout(timeout);
 try{
  const r=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts}],generationConfig}),signal});
  if(!r.ok){const message=r.status===429?'Provider quota or rate limit exceeded':r.status===403||r.status===401?'Provider rejected credentials or permissions':r.status===400?'Provider rejected model or request settings':'Provider request failed';fail(502,message+' (HTTP '+r.status+'). No automatic retry.');}
  const result=await r.json();
  const output=result.candidates?.[0]?.content?.parts?.filter(p=>!p.thought)||[];
  if(!output.length)fail(502,'Provider returned no usable result. '+(result.candidates?.[0]?.finishReason||result.promptFeedback?.blockReason||''));
  return output;
 }catch(e){if(signal.aborted)fail(504,'Provider timed out. Remote job may still finish; check before retrying.');throw e;}
}
function jsonText(parts){try{return parseJson(parts.map(p=>p.text||'').join(''))}catch{fail(502,'Provider returned invalid JSON.')}}
export async function operate(stage,b,options){
 if(!b||typeof b!=='object')fail(400,'Invalid request.');
 if(stage==='detect'){const out=await gemini(textModel,[{text:detectionPrompt},imagePart(b.source)],{responseMimeType:'application/json'},{...options,timeout:60000});return {products:productList(jsonText(out))};}
 if(stage==='generate'){
  const p=productList([b.product])[0],c=b.config;
  if(!c||!Object.hasOwn(models,c.model)||!ratios.includes(c.ratio)||!Object.hasOwn(modes,c.mode)||!angles.includes(b.angle))fail(400,'Invalid generation settings.');
  const refs=b.references||[];if(!Array.isArray(refs)||refs.length>5)fail(400,'At most five references.');
  const parts=[{text:promptFor(p,c,b.angle)},{text:'Original source'},imagePart(b.source),...refs.flatMap(i=>[{text:'Construction reference'},imagePart(i)])];
  if(b.logo&&!['preserve-original','no-branding'].includes(c.mode))parts.push({text:'Official MELATO logo'},imagePart(b.logo));
  const out=await gemini(c.model,parts,{responseModalities:['IMAGE'],imageConfig:{aspectRatio:c.ratio} },options);
  const images=out.filter(p=>p.inlineData?.data);if(images.length!==1)fail(502,'Expected exactly one image, received '+images.length+'.');
  const image={base64:images[0].inlineData.data,mimeType:images[0].inlineData.mimeType};imagePart(image);return {image};
 }
 if(stage==='qc'){const out=await gemini(textModel,[{text:qcPrompt+' Target: '+String(b.product?.name||'').slice(0,2000)},imagePart(b.source),imagePart(b.image)],{responseMimeType:'application/json'},{...options,timeout:60000});return {report:qcReport(jsonText(out))};}
 fail(404,'Unknown operation');
}
async function body(req){let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>MAX)fail(413,'Request exceeds 24 MB. Reduce input sizes.');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{fail(400,'Invalid JSON')}}
export function createServer({key=process.env.GEMINI_API_KEY,allow=process.env.ALLOW_AI_REQUESTS==='true',fetcher=fetch}={}){
 let busy=false;
 return http.createServer(async(req,res)=>{
  const send=(status,value)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))}};
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   const host=req.headers.host||'';
   if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))return send(403,{error:'Local access only'});
   if(req.method==='GET'&&path==='/api/status')return send(200,{enabled:!!key&&allow,models});
   if(req.method==='GET'&&assets[path]){const [name,type]=assets[path];const data=await readFile(new URL('./public/'+name,import.meta.url));res.writeHead(200,{'Content-Type':type});return res.end(data)}
   if(req.method!=='POST'||!['/api/detect','/api/generate','/api/qc'].includes(path))return send(404,{error:'Not found'});
   if(req.headers.origin&&req.headers.origin!=='http://'+host)return send(403,{error:'Cross-origin request rejected'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON required'});
   if(!key||!allow)return send(503,{error:'AI API disabled. Manual mode is available. Set key and explicit opt-in locally.'});
   if(busy)return send(409,{error:'Another operation is active.'});
   busy=true;try{const b=await body(req);if(b.confirmed!==true)fail(400,'Explicit API consent required.');send(200,await operate(path.slice(5),b,{key,fetcher}));}finally{busy=false}
  }catch(e){send(e.status||502,{error:e.status?e.message:'Invalid provider response or network failure. No automatic retry.'});}
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])createServer().listen(Number(process.env.PORT||8766),'127.0.0.1',()=>console.log('MELATO Deconstruct: http://127.0.0.1:'+(process.env.PORT||8766)));
