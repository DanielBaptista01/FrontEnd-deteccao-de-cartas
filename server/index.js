import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { adaptRoboflowResponse } from './roboflow.js';
import { isValidModelId } from './model-id.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const model = (process.env.ROBOFLOW_MODEL_ID || '').trim();
const key = (process.env.ROBOFLOW_API_KEY || '').trim();
const ready = !!key && isValidModelId(model);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
let classMap = {};
if (process.env.ROBOFLOW_CLASS_MAP) {
  try { classMap = JSON.parse(readFileSync(resolve(process.env.ROBOFLOW_CLASS_MAP), 'utf8')); }
  catch (e) { console.error('Mapa de classes inválido:', e.message); process.exitCode = 1; }
}

app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ configured: ready, provider: 'roboflow' }));
app.post('/api/detect', upload.single('image'), async (req, res) => {
  if (!ready) return res.status(503).json({ error: 'Roboflow não configurado no servidor. Informe ROBOFLOW_MODEL_ID e ROBOFLOW_API_KEY no .env.' });
  if (!req.file || !['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) return res.status(400).json({ error: 'Envie uma imagem JPEG, PNG ou WebP no campo image.' });
  const apiUrl = new URL(`https://serverless.roboflow.com/${model}`);
  apiUrl.searchParams.set('confidence', '0.30'); // Roboflow test-set optimal threshold; frontend still requires repeated >=80% confidence to register
  try {
    const response = await fetch(apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Bearer ${key}` },
      body: req.file.buffer.toString('base64'), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return res.status(502).json({ error: `Roboflow retornou HTTP ${response.status}. Verifique o modelo, a versão e a chave.` });
    return res.json(adaptRoboflowResponse(await response.json(), classMap));
  } catch (error) {
    console.error('Erro de inferência:', error.message);
    return res.status(502).json({ error: 'Não foi possível consultar o Roboflow.' });
  }
});
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(413).json({ error: 'Imagem grande demais (máximo 3 MB).' });
  if (err) return res.status(400).json({ error: 'Erro no envio da imagem.' });
  next();
});
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}
app.listen(port, '127.0.0.1', () => console.log(`CardVision API em http://127.0.0.1:${port} (Roboflow ${ready ? 'configurado' : 'pendente'})`));
