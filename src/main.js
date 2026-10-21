import './style.css';
import { DECK, SUITS, RANKS, normalizeCard, probabilities } from './deck.js';

const app = document.querySelector('#app');
const STORAGE_KEY = 'cardvision-removed-v1';
let removed = new Set();
try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); if (Array.isArray(stored)) removed = new Set(stored.filter(id => DECK.some(card => card.id === id))); } catch { /* dados inválidos: inicia vazio */ }
let stream = null;
let sessionEnabled = false;
let lastDetected = null;
let detectionCandidate = null;
let cooldownUntil = 0;
let detectionTimer = null;
let detectorUrl = localStorage.getItem('cardvision-detector-url') ?? '/api/detect';
let processing = false;
let activeFilter = 'all';
let cameraStarting = false;
const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify([...removed]));
const formatPercent = p => `${p.toFixed(2).replace('.', ',')}%`;
const log = (message, tone = '') => { const container = document.querySelector('#activity'); if (!container) return; const item = document.createElement('div'); item.className = `event ${tone}`; item.textContent = `${new Date().toLocaleTimeString('pt-BR')} · ${message}`; container.prepend(item); while (container.children.length > 5) container.lastChild.remove(); };

app.innerHTML = `
<header class="site-header"><div class="brand"><div class="brand-icon">♠</div><div><strong>Card<span>Vision</span></strong><small>DETECÇÃO INTELIGENTE DE BARALHO</small></div></div><div class="header-right"><span class="dot"></span><span>PAINEL DE PROBABILIDADES</span><button class="icon-btn" id="settings-open" aria-label="Configurar detector">⚙</button></div></header>
<main class="container">
<div class="page-heading"><div><div class="eyebrow">MONITORAMENTO EM TEMPO REAL <span class="heading-line"></span></div><h1>Visão geral do <em>baralho.</em></h1><p>Acompanhe cada carta detectada e a chance da próxima jogada.</p></div><div class="overview"><div><span>CARTAS RESTANTES</span><strong id="remaining-counter">52 <small>/ 52</small></strong></div><div><span>JÁ IDENTIFICADAS</span><strong id="removed-counter">00</strong></div><div><span>ESTADO</span><strong class="overview-status" id="overview-state">Aguardando</strong></div></div></div>
<div class="dashboard">
<section class="panel camera-panel"><div class="panel-heading"><div><span class="panel-number">01 /</span><h2>Visão da câmera</h2></div><span class="state-pill" id="camera-badge"><span class="state-dot"></span> Desconectada</span></div><div class="video-shell"><video id="camera" autoplay playsinline muted aria-label="Transmissão da webcam"></video><canvas id="detections-overlay" aria-hidden="true"></canvas><div class="camera-placeholder" id="camera-placeholder"><span class="viewfinder">⌗</span><h3>Webcam não iniciada</h3><p>Ative a câmera para visualizar suas cartas.</p></div><div class="scan-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="live-mark" id="live-mark">● AO VIVO</div><div class="camera-card" id="camera-card"></div></div><div class="camera-controls"><button id="camera-button" class="btn primary">◉ &nbsp; Ativar webcam</button><button id="stop-button" class="btn secondary" disabled>Parar</button><span class="camera-help" id="camera-help">Permita o acesso à câmera do dispositivo.</span></div><div class="manual-row"><label for="manual-card">Registrar carta manualmente</label><div class="manual-actions"><select id="manual-card" aria-label="Selecionar carta"></select><button class="btn secondary" id="add-card">+ Registrar</button></div></div><p class="notice" id="notice" role="status" aria-live="polite"></p></section>
<section class="panel cards-panel"><div class="panel-heading"><div><span class="panel-number">02 /</span><h2>Probabilidade por carta</h2></div><span class="small-badge">PRÓXIMA CARTA</span></div><p class="panel-description">Chance de cada carta ser a próxima retirada do baralho.</p><div class="filter-tabs" id="filters"><button data-filter="all" class="selected">Todos</button><button data-filter="hearts">♥ Copas</button><button data-filter="diamonds">♦ Ouros</button><button data-filter="clubs">♣ Paus</button><button data-filter="spades">♠ Espadas</button></div><div class="cards-scroll"><div class="cards-grid" id="cards-grid"></div></div><div class="cards-legend"><span><i class="legend-dot green"></i> Disponível</span><span><i class="legend-dot gray"></i> Já retirada</span></div></section>
<section class="panel suits-panel"><div class="panel-heading"><div><span class="panel-number">03 /</span><h2>Probabilidade por naipe</h2></div><span class="small-badge">4 NAIPES</span></div><p class="panel-description">Distribuição das cartas restantes por naipe.</p><div class="suit-list" id="suit-list"></div></section>
<section class="panel colors-panel"><div class="panel-heading"><div><span class="panel-number">04 /</span><h2>Vermelho ou preto?</h2></div><span class="small-badge">2 CORES</span></div><p class="panel-description">Qual a probabilidade de a próxima carta ter cada cor?</p><div id="colors-content"></div><div class="activity-wrapper"><div class="activity-header"><strong>Atividade recente</strong><button id="undo" class="text-btn">↶ Desfazer última</button></div><div id="activity"><div class="event">Sem eventos nesta sessão.</div></div></div></section>
</div><footer class="footer"><span>♠ CARDVISION <span class="footer-separator">/</span> BARALHO PADRÃO DE 52 CARTAS</span><button id="reset" class="reset-btn">↻ Reiniciar baralho</button></footer>
</main>
<dialog id="settings"><form method="dialog" class="settings-box"><div class="settings-heading"><h2>Integração de detecção</h2><button class="icon-btn" value="cancel" aria-label="Fechar">✕</button></div><p>O backend CardVision já está preparado para chamar o modelo treinado do Roboflow. Configure o ID da versão e a chave em um arquivo .env local, sem expor a chave no navegador. Também é possível configurar outro endpoint.</p><label for="api-url">Endpoint de detecção</label><input id="api-url" type="text" placeholder="/api/detect" autocomplete="off"/><p class="settings-tip">Requisição <code>POST</code> com <code>multipart/form-data</code> no campo <code>image</code>. Resposta: <code>{"card":"AS","confidence":0.99}</code> ou <code>{"rank":"A","suit":"spades","confidence":0.99}</code>. O endpoint padrão é <code>/api/detect</code> (Roboflow via servidor local). A carta é registrada depois de 2 detecções consecutivas com confiança ≥ 0,80. Se usar outra origem, configure CORS no backend.</p><div class="dialog-buttons"><button class="btn secondary" id="clear-api" type="button">Remover integração</button><button class="btn primary" id="save-api" value="default">Salvar</button></div></form></dialog>`;

const video = document.querySelector('#camera');
const overlay = document.querySelector('#detections-overlay');
const notice = document.querySelector('#notice');
const manualSelect = document.querySelector('#manual-card');
manualSelect.innerHTML = '<option value="">Selecione uma carta</option>' + DECK.map(c => `<option value="${c.id}">${c.label} — ${SUITS.find(s=>s.id===c.suit).label}</option>`).join('');
function render() {
 const data = probabilities([...removed]);
 document.querySelector('#remaining-counter').innerHTML = `${data.total} <small>/ 52</small>`;
 document.querySelector('#removed-counter').textContent = `${data.removed}`.padStart(2, '0');
 const visibleCards = data.cards.filter(card => activeFilter === 'all' || card.suit === activeFilter);
 document.querySelector('#cards-grid').innerHTML = visibleCards.map(card => `<div class="card-tile ${card.remaining ? '' : 'gone'} ${card.color}" title="${card.remaining ? 'Disponível' : 'Retirada'}: ${card.label}"><span class="rank">${card.rank}</span><span class="suit-symbol">${card.symbol}</span><span class="tile-prob">${formatPercent(card.probability)}</span></div>`).join('');
 document.querySelector('#suit-list').innerHTML = data.suits.map(suit => `<div class="suit-row"><div class="suit-emblem ${suit.color}">${suit.symbol}</div><div class="suit-main"><div class="suit-line"><div><strong>${suit.label}</strong><span>${suit.count} de 13 cartas</span></div><b>${formatPercent(suit.probability)}</b></div><div class="bar-track"><div class="bar-fill ${suit.color}" style="width:${suit.probability}%"></div></div></div></div>`).join('');
 const red = data.colors.find(c=>c.color==='red'); const black = data.colors.find(c=>c.color==='black');
 document.querySelector('#colors-content').innerHTML = `<div class="color-stats"><div class="color-stat red"><span>♥ ♦ &nbsp; VERMELHO</span><strong>${formatPercent(red.probability)}</strong><small>${red.count} cartas restantes</small></div><div class="color-stat black"><span>♠ ♣ &nbsp; PRETO</span><strong>${formatPercent(black.probability)}</strong><small>${black.count} cartas restantes</small></div></div><div class="color-bar"><div class="color-red-fill" style="width:${red.probability}%"></div><div class="color-black-fill" style="width:${black.probability}%"></div></div><div class="color-caption"><span>♥ Vermelho</span><span>Preto ♠</span></div>`;
 const latest = lastDetected && DECK.find(c=>c.id===lastDetected);
 document.querySelector('#camera-card').innerHTML = latest ? `<span>ÚLTIMA CARTA REGISTRADA</span><strong class="${latest.color}">${latest.label}</strong>` : '';
 document.querySelector('#undo').disabled = !removed.size;
 document.querySelector('#overview-state').textContent = data.total === 0 ? 'Baralho finalizado' : sessionEnabled ? 'Em operação' : 'Aguardando';
 manualSelect.querySelectorAll('option').forEach(opt => {if(opt.value) opt.disabled = removed.has(opt.value)});
}
function notify(message, isError=false) {notice.textContent=message; notice.classList.toggle('error',isError)}
function addCard(value, source = 'manual') {
 const card = normalizeCard(value);
 if (!card) {notify('Carta inválida. Escolha uma carta do baralho.',true);return false}
 if (removed.has(card.id)) {notify(`${card.label} já foi retirada; nenhuma alteração realizada.`,true);return false}
 removed.add(card.id); lastDetected=card.id; persist();render();log(`${card.label} detectada e retirada do baralho (${source === 'camera' ? 'API' : 'manual'})`,'success'); notify(`${card.label} registrada. Restam ${52-removed.size} cartas.`);return true;
}
const cameraButton=document.querySelector('#camera-button'),stopButton=document.querySelector('#stop-button');
async function startCamera() {
 if(cameraStarting || stream) return; cameraStarting=true; cameraButton.disabled=true;
 try {
 if (!navigator.mediaDevices?.getUserMedia) throw new Error('Webcam indisponível neste contexto. Use HTTPS ou localhost.');
 stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
 video.srcObject=stream; await video.play();
 video.classList.add('visible');document.querySelector('#camera-placeholder').hidden=true;document.querySelector('#live-mark').classList.add('visible');
 document.querySelector('#camera-badge').innerHTML='<span class="state-dot"></span> Conectada';document.querySelector('#camera-badge').classList.add('connected');
 sessionEnabled=true;cameraButton.textContent='◉ Webcam ativa';stopButton.disabled=false;
 document.querySelector('#camera-help').textContent=detectorUrl?'Detector conectado por API':'Sem API: registre cartas manualmente';
 render();notify('Webcam ativa. ' + (detectorUrl?'Detecção por API habilitada.':'Configure a API de detecção ou use o registro manual.'));log('Webcam iniciada');
 if(detectorUrl) startDetector();
 } catch(err) {notify(`Não foi possível iniciar a webcam: ${err.message}`,true);stopCamera();}
 finally {cameraStarting=false;cameraButton.disabled=!!stream}
}
function stopCamera() {
 overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);
 stopDetector(); if(stream) stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;video.classList.remove('visible');
 document.querySelector('#camera-placeholder').hidden=false;document.querySelector('#live-mark').classList.remove('visible');
 document.querySelector('#camera-badge').innerHTML='<span class="state-dot"></span> Desconectada'; document.querySelector('#camera-badge').classList.remove('connected');
 cameraButton.textContent='◉  Ativar webcam';cameraButton.disabled=false;stopButton.disabled=true;sessionEnabled=false;render();
}
function stopDetector(){if(detectionTimer) clearInterval(detectionTimer);detectionTimer=null;detectionCandidate=null;processing=false;}
async function startDetector(){
 stopDetector(); if(!stream||!detectorUrl)return;
 if(detectorUrl === '/api/detect') {
  try {
   const res = await fetch('/api/health');
   if(!res.ok || !(await res.json()).configured) {
    document.querySelector('#camera-help').textContent='Roboflow pendente: configure o arquivo .env';
    notify('Webcam disponível; detecção automática aguardando a configuração do modelo no servidor.');
    return;
   }
  } catch {
   document.querySelector('#camera-help').textContent='Servidor da API indisponível';
   notify('Webcam disponível; inicialize o servidor CardVision para a detecção automática.');
   return;
  }
 }
 detectionTimer=setInterval(async()=>{
 if(processing||!video.videoWidth||Date.now()<cooldownUntil)return;processing=true;
 try {const canvas=document.createElement('canvas');canvas.width=640;canvas.height=Math.round(640*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8)); if(!blob)return;
 const body=new FormData();body.append('image',blob,'frame.jpg');
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),3500);
 let response;try{response=await fetch(detectorUrl,{method:'POST',body,signal:controller.signal});}finally{clearTimeout(timeout)}
 if(!response.ok) { const detail=await response.json().catch(()=>({})); throw new Error(detail.error || `HTTP ${response.status}`); }
 const result=await response.json();drawDetections(result);
 if(result.unknownClasses?.length && !result.card) document.querySelector('#camera-help').textContent='Classe não identificada: '+result.unknownClasses[0];
 const card=normalizeCard(result.card ?? (result.rank && result.suit?{rank:result.rank,suit:result.suit}:null));
 const confidence=Number(result.confidence??0);
 if(!card||confidence<0.80||removed.has(card.id)){detectionCandidate=null;return}
 if(detectionCandidate?.id===card.id) detectionCandidate.count++; else detectionCandidate={id:card.id,count:1};
 if(detectionCandidate.count>=2){if(addCard(card.id,'camera'))cooldownUntil=Date.now()+3000;detectionCandidate=null}
 }catch(err){document.querySelector('#camera-help').textContent=`API: ${err.message}`;}finally{processing=false}
},1300)}
function drawDetections(result) {
 const dimensions = result?.image;
 const boxes = Array.isArray(result?.predictions) ? result.predictions : [];
 const rect = video.getBoundingClientRect();
 const dpr = Math.min(window.devicePixelRatio || 1, 2);
 overlay.width=Math.round(rect.width*dpr);overlay.height=Math.round(rect.height*dpr);
 const ctx=overlay.getContext('2d');ctx.scale(dpr,dpr);
 const imgWidth=Number(dimensions?.width),imgHeight=Number(dimensions?.height);
 if(!imgWidth||!imgHeight||!rect.width||!rect.height)return;
 const factor=Math.max(rect.width/imgWidth,rect.height/imgHeight);
 const left=(rect.width-imgWidth*factor)/2,top=(rect.height-imgHeight*factor)/2;
 for(const prediction of boxes){
  if(!prediction.card || prediction.confidence < 0.4) continue;
  const {x,y,width,height}=prediction;
  if(![x,y,width,height].every(Number.isFinite))continue;
  const bx=left+(x-width/2)*factor,by=top+(y-height/2)*factor,bw=width*factor,bh=height*factor;
  ctx.strokeStyle='#48d9bb';ctx.lineWidth=2.5;ctx.strokeRect(bx,by,bw,bh);
  const tag=`${prediction.card} · ${Math.round(prediction.confidence*100)}% confiança`;
  ctx.font='bold 13px sans-serif';const tw=ctx.measureText(tag).width+15;
  const yTag=Math.max(0,by-21);
  ctx.fillStyle='#144d50';ctx.fillRect(bx,yTag,tw,21);
  ctx.fillStyle='#e7fff8';ctx.fillText(tag,bx+7,yTag+15);
 }
}
cameraButton.addEventListener('click',startCamera);stopButton.addEventListener('click',()=>{stopCamera();notify('Webcam desligada.');log('Webcam desligada')});
document.querySelector('#add-card').addEventListener('click',()=>{if(addCard(manualSelect.value))manualSelect.value=''});
document.querySelector('#filters').addEventListener('click',event=>{const filter=event.target.closest('button')?.dataset.filter;if(!filter)return;activeFilter=filter;document.querySelectorAll('#filters button').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));render()});
document.querySelector('#undo').addEventListener('click',()=>{const cards=[...removed];const last=cards.pop();if(!last)return;removed.delete(last);lastDetected=cards.at(-1)||null;persist();render();notify(`${DECK.find(c=>c.id===last).label} devolvida ao baralho.`);log('Último registro desfeito')});
document.querySelector('#reset').addEventListener('click',()=>{if(!removed.size)return;if(!confirm('Reiniciar o baralho e devolver todas as cartas?'))return;removed.clear();lastDetected=null;persist();render();notify('Baralho reiniciado com 52 cartas.');log('Baralho reiniciado')});
const settings=document.querySelector('#settings');document.querySelector('#settings-open').addEventListener('click',()=>{document.querySelector('#api-url').value=detectorUrl;settings.showModal()});
document.querySelector('#save-api').addEventListener('click',e=>{const input=document.querySelector('#api-url');if(input.value && input.value.trim() !== '/api/detect' && !/^https?:\/\/[^\s]+$/i.test(input.value.trim())){e.preventDefault();notify('Use /api/detect ou uma URL http(s) válida.',true);return}detectorUrl=input.value.trim();localStorage.setItem('cardvision-detector-url',detectorUrl);document.querySelector('#camera-help').textContent=detectorUrl?'API configurada':'Registro manual disponível';if(stream){if(detectorUrl)startDetector();else stopDetector()}notify(detectorUrl?'Endpoint salvo.':'Integração removida.');});
document.querySelector('#clear-api').addEventListener('click',()=>{document.querySelector('#api-url').value='';detectorUrl='';localStorage.removeItem('cardvision-detector-url');stopDetector();settings.close();notify('Integração removida; registro manual disponível.')});
window.addEventListener('beforeunload',()=>{stopCamera()});
render();
