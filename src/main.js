import './style.css';
import { DECK, SUITS, RANKS, normalizeCard, probabilities } from './deck.js';
import { startWorkflowWebRTC } from './workflow-webrtc.js';
import { createRemovalTracker } from './workflow-events.js';

const app = document.querySelector('#app');
const STORAGE_KEY = 'cardvision-removed-v1';
let removed = new Set();
try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); if (Array.isArray(stored)) removed = new Set(stored.filter(id => DECK.some(card => card.id === id))); } catch { /* dados inválidos: inicia vazio */ }
let stream = null;
let sessionEnabled = false;
let lastDetected = null;
const tracker = createRemovalTracker();
let webRtcSession = null;
let detectorGeneration = 0;
let sessionLimitTimer = null;
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
<section class="panel camera-panel"><div class="panel-heading"><div><span class="panel-number">01 /</span><h2>Visão da câmera</h2></div><span class="state-pill" id="camera-badge"><span class="state-dot"></span> Desconectada</span></div><div class="video-shell"><video id="camera" autoplay playsinline muted aria-label="Transmissão da webcam"></video><canvas id="detections-overlay" aria-hidden="true"></canvas><div class="camera-placeholder" id="camera-placeholder"><span class="viewfinder">⌗</span><h3>Webcam não iniciada</h3><p>Ative a câmera para visualizar suas cartas.</p></div><div class="scan-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="live-mark" id="live-mark">● AO VIVO</div><div class="camera-card" id="camera-card"></div></div><div class="camera-controls"><button id="camera-button" class="btn primary">◉ &nbsp; Ativar webcam</button><button id="stop-button" class="btn secondary" disabled>Parar</button><span class="camera-help" id="camera-help">WebRTC Serverless GPU: confirme que o vídeo será transmitido à nuvem.</span></div><div class="manual-row"><label for="manual-card">Registrar carta manualmente</label><div class="manual-actions"><select id="manual-card" aria-label="Selecionar carta"></select><button class="btn secondary" id="add-card">+ Registrar</button></div></div><p class="notice" id="notice" role="status" aria-live="polite"></p></section>
<section class="panel cards-panel"><div class="panel-heading"><div><span class="panel-number">02 /</span><h2>Probabilidade por carta</h2></div><span class="small-badge">PRÓXIMA CARTA</span></div><p class="panel-description">Chance de cada carta ser a próxima retirada do baralho.</p><div class="filter-tabs" id="filters"><button data-filter="all" class="selected">Todos</button><button data-filter="hearts">♥ Copas</button><button data-filter="diamonds">♦ Ouros</button><button data-filter="clubs">♣ Paus</button><button data-filter="spades">♠ Espadas</button></div><div class="cards-scroll"><div class="cards-grid" id="cards-grid"></div></div><div class="cards-legend"><span><i class="legend-dot green"></i> Disponível</span><span><i class="legend-dot gray"></i> Já retirada</span></div></section>
<section class="panel suits-panel"><div class="panel-heading"><div><span class="panel-number">03 /</span><h2>Probabilidade por naipe</h2></div><span class="small-badge">4 NAIPES</span></div><p class="panel-description">Distribuição das cartas restantes por naipe.</p><div class="suit-list" id="suit-list"></div></section>
<section class="panel colors-panel"><div class="panel-heading"><div><span class="panel-number">04 /</span><h2>Vermelho ou preto?</h2></div><span class="small-badge">2 CORES</span></div><p class="panel-description">Qual a probabilidade de a próxima carta ter cada cor?</p><div id="colors-content"></div><div class="activity-wrapper"><div class="activity-header"><strong>Atividade recente</strong><button id="undo" class="text-btn">↶ Desfazer última</button></div><div id="activity"><div class="event">Sem eventos nesta sessão.</div></div></div></section>
</div><footer class="footer"><span>♠ CARDVISION <span class="footer-separator">/</span> BARALHO PADRÃO DE 52 CARTAS</span><button id="reset" class="reset-btn">↻ Reiniciar baralho</button></footer>
</main>
<dialog id="settings"><form method="dialog" class="settings-box"><div class="settings-heading"><h2>Roboflow WebRTC</h2><button class="icon-btn" value="cancel" aria-label="Fechar">✕</button></div><p>Workflow publicado: <strong>Cards vcards-ksgh0-2-rfdetr-small-t1 Logic</strong>. Workspace: cardsdetection-pwqty.</p><p>A webcam é transmitida à GPU do Roboflow somente quando você ativa a câmera. A sessão é limitada a 3 minutos, pode consumir créditos, e você pode interrompê-la a qualquer momento.</p><p>Configure exclusivamente <code>ROBOFLOW_API_KEY</code> no arquivo .env do backend. Nunca coloque essa chave no frontend.</p><div class="dialog-buttons"><button class="btn primary" value="default">Fechar</button></div></form></dialog></dialog>`;

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
async function startCamera(){
 if(cameraStarting||stream)return;
 cameraStarting=true;cameraButton.disabled=true;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('É necessário HTTPS ou localhost para acessar a webcam.');
  const status=await fetch('/api/health',{signal:AbortSignal.timeout(6000)});
  if(!status.ok || !(await status.json()).configured)throw new Error('Configure ROBOFLOW_API_KEY no servidor CardVision.');
  stream=await navigator.mediaDevices.getUserMedia({
   video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}},audio:false
  });
  video.srcObject=stream;
  await video.play();
  video.classList.add('visible');document.querySelector('#camera-placeholder').hidden=true;document.querySelector('#live-mark').classList.add('visible');
  document.querySelector('#camera-badge').innerHTML='<span class="state-dot"></span> Conectada';
  document.querySelector('#camera-badge').classList.add('connected');
  sessionEnabled=true;cameraButton.textContent='◉ Webcam ativa';stopButton.disabled=false;
  document.querySelector('#camera-help').textContent='Conectando WebRTC Serverless GPU...';
  render();notify('Iniciando Workflow WebRTC. O primeiro acesso pode levar mais tempo.');log('Webcam e conexão remota iniciadas');
  startDetector();
 }catch(error){stopCamera();notify(`Não foi possível iniciar: ${error.message}`,true);}
 finally{cameraStarting=false;cameraButton.disabled=!!stream;}
}
function stopDetector(){
 detectorGeneration++;
 tracker.reset();
 if(sessionLimitTimer){clearTimeout(sessionLimitTimer);sessionLimitTimer=null;}
 const old=webRtcSession;webRtcSession=null;
 if(old)old.stop().catch(()=>notify('Webcam fechada; não foi possível confirmar o encerramento da GPU.',true));
}
function stopCamera(){
 stopDetector();
 overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);
 if(stream)stream.getTracks().forEach(track=>track.stop());
 stream=null;video.srcObject=null;video.classList.remove('visible');
 document.querySelector('#camera-placeholder').hidden=false;document.querySelector('#live-mark').classList.remove('visible');
 document.querySelector('#camera-badge').innerHTML='<span class="state-dot"></span> Desconectada';
 document.querySelector('#camera-badge').classList.remove('connected');
 cameraButton.textContent='◉ Ativar webcam';cameraButton.disabled=false;stopButton.disabled=true;
 sessionEnabled=false;render();
}
async function startDetector(){
 if(!stream)return;
 const generation=detectorGeneration;
 try{
  const connection=await startWorkflowWebRTC(stream,{
   onData:result=>{
    if(generation!==detectorGeneration)return;
    drawDetections(result);
    const removedId=tracker.consume(result,removed);
    if(removedId) addCard(removedId,'camera');
    else if(tracker.armedCard){
      const card=DECK.find(c=>c.id===tracker.armedCard);
      document.querySelector('#camera-help').textContent=`${card?.label??''} reconhecida: retire-a da câmera para registrar.`;
    }
   },
   onState:state=>{
    if(generation===detectorGeneration){document.querySelector('#camera-help').textContent=state;notify(state,true);}
   }
  });
  if(generation!==detectorGeneration){await connection.stop().catch(()=>{});return;}
  webRtcSession=connection;
  document.querySelector('#camera-help').textContent='WebRTC conectado • mostre uma carta e retire-a da câmera.';
  notify('Detecção WebRTC ativa. Registro após reconhecimento confirmado e retirada da imagem.');
  sessionLimitTimer=setTimeout(()=>{if(generation===detectorGeneration){stopCamera();notify('Sessão WebRTC encerrada após 3 minutos. Ative novamente para continuar.');}},175000);
 }catch(error){
  if(generation===detectorGeneration){
   document.querySelector('#camera-help').textContent='WebRTC indisponível';
   notify(`Falha ao iniciar Workflow: ${error.message}`,true);
   log('Não foi possível estabelecer a conexão WebRTC');
  }
 }
}
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
const settings=document.querySelector('#settings');
document.querySelector('#settings-open').addEventListener('click',()=>settings.showModal());
window.addEventListener('beforeunload',()=>{stopCamera()});
render();
