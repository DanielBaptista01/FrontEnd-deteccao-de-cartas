import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { adaptWorkflowResult, initializeWorkflowWebRTC, runWorkflowImage, terminateWorkflowWebRTC, WORKFLOW, WorkflowRequestError } from './workflow-client.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const key = (process.env.ROBOFLOW_API_KEY || '').trim();
const ready = !!key;
const sessions = new Map();
const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:3*1024*1024,files:1}});
let classMap={};
if(process.env.ROBOFLOW_CLASS_MAP){
 try{classMap=JSON.parse(readFileSync(resolve(process.env.ROBOFLOW_CLASS_MAP),'utf8'));}
 catch(error){console.error('Falha na configuração do mapa de classes:', error.message);process.exit(1);}
}
const SAME_ORIGINS = new Set([
  `http://127.0.0.1:${port}`,`http://localhost:${port}`,
  'http://localhost:5173','http://127.0.0.1:5173',
]);
function localOrigin(req,res,next) {
  const origin=req.get('origin');
  if(origin && !SAME_ORIGINS.has(origin))return res.status(403).json({message:'Origem não autorizada.'});
  next();
}
function respondError(res,error){
  const status=error instanceof WorkflowRequestError ? (error.status>=400 && error.status<500 ? error.status : 502):502;
  return res.status(status).json({message:error instanceof WorkflowRequestError ? error.message:'Roboflow indisponível.'});
}
app.disable('x-powered-by');
app.use('/api',localOrigin);
app.get('/api/health',(_req,res)=>res.json({configured:ready,provider:'roboflow-workflow',workspace:WORKFLOW.workspace,workflow:WORKFLOW.id}));
app.post('/api/detect',upload.single('image'),async(req,res)=>{
  if(!ready)return res.status(503).json({message:'ROBOFLOW_API_KEY não configurada.'});
  if(!req.file || !['image/jpeg','image/png','image/webp'].includes(req.file.mimetype))
    return res.status(400).json({message:'Envie uma imagem JPEG, PNG ou WebP no campo image.'});
  try{
    const result=await runWorkflowImage(req.file.buffer,key);
    return res.json(adaptWorkflowResult(result,classMap));
  }catch(error){return respondError(res,error);}
});
// SDK JS signals WebRTC through this localhost proxy. Identity/options are pinned
// server-side to the actual saved Workflow, never provided by a browser.
app.post('/api/init-webrtc',express.json({limit:'125kb'}),async(req,res)=>{
  if(!ready)return res.status(503).json({message:'ROBOFLOW_API_KEY não configurada.'});
  try{
    const answer=await initializeWorkflowWebRTC(req.body?.offer,key);
    const pipelineId=answer?.context?.pipeline_id;
    if(typeof pipelineId==='string' && /^[a-z0-9_-]{8,128}$/i.test(pipelineId)){
      sessions.set(pipelineId,Date.now());
      for(const [id,time] of sessions)if(Date.now()-time>5*60*1000)sessions.delete(id);
    }
    return res.json(answer);
  }catch(error){return respondError(res,error);}
});
app.post('/api/stop-webrtc',express.json({limit:'4kb'}),async(req,res)=>{
  if(!ready)return res.status(503).json({message:'ROBOFLOW_API_KEY não configurada.'});
  const id=req.body?.pipelineId;
  if(typeof id!=='string' || !sessions.has(id))return res.status(404).json({message:'Sessão desconhecida.'});
  try{
    await terminateWorkflowWebRTC(id,key);
    sessions.delete(id);
    return res.json({stopped:true});
  }catch(error){return respondError(res,error);}
});
app.use((error,_req,res,next)=>{
  if(error instanceof multer.MulterError)return res.status(413).json({message:'Imagem grande demais (limite 3MB).'});
  if(error)return res.status(400).json({message:'Requisição inválida.'});
  next();
});
const dist=resolve('dist');
if(existsSync(dist)){
  app.use(express.static(dist));
  app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')));
}
app.listen(port,'127.0.0.1',()=>console.log(`CardVision em http://127.0.0.1:${port}; Workflow ${ready?'configurado':'pendente'}`));
