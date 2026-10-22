// Saved and published Workflow, verified through Roboflow MCP workflows_get.
// It accepts image and publishes the sole JSON output named "predictions".
import { adaptRoboflowResponse } from './roboflow.js';
export const WORKFLOW = Object.freeze({
  workspace: 'cardsdetection-pwqty',
  id: 'cards-vcards-ksgh0-2-rfdetr-small-t1-logic',
  input: 'image',
  output: 'predictions',
});
const BASE = 'https://serverless.roboflow.com';
export class WorkflowRequestError extends Error {
  constructor(message, status = 0, retryable = false) {
    super(message);
    this.name = 'WorkflowRequestError';
    this.status = status;
    this.retryable = retryable;
  }
}
const transient = status => status === 408 || status === 429 || status >= 500;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const unwrapMessage = async response => {
  try {
    const parsed = await response.json();
    return typeof parsed?.message === 'string' ? parsed.message.slice(0, 180)
      : typeof parsed?.detail === 'string' ? parsed.detail.slice(0, 180) : 'Erro do Roboflow';
  } catch { return 'Erro do Roboflow'; }
};
export async function postWorkflow(url, key, payload, { fetchImpl = fetch, timeoutMs = 30000, retries = 2, sleepImpl = sleep } = {}) {
  if (!key) throw new WorkflowRequestError('ROBOFLOW_API_KEY não configurada.');
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await unwrapMessage(response);
        throw new WorkflowRequestError(`Roboflow HTTP ${response.status}: ${message}`, response.status, transient(response.status));
      }
      return await response.json();
    } catch (error) {
      const failure = error instanceof WorkflowRequestError
        ? error : new WorkflowRequestError(error?.name === 'AbortError' ? 'Tempo esgotado na API do Roboflow.' : 'Falha de comunicação com Roboflow.', 0, true);
      if (!failure.retryable || attempt === retries) throw failure;
      await sleepImpl(250 * (2 ** attempt));
    } finally { clearTimeout(timeout); }
  }
}
export function extractWorkflowResult(result) {
  const item = Array.isArray(result) ? result[0] : null;
  if (!item || !Object.hasOwn(item, WORKFLOW.output)) {
    throw new WorkflowRequestError(`Resposta sem saída declarada: ${WORKFLOW.output}`);
  }
  const value = item[WORKFLOW.output];
  if (!value || !Array.isArray(value.predictions) || !value.image) {
    throw new WorkflowRequestError('Estrutura de deteções inesperada.');
  }
  return value;
}
export function adaptWorkflowResult(result, classMap = {}) {
  return adaptRoboflowResponse(extractWorkflowResult(result), classMap);
}
export async function runWorkflowImage(image, key, options = {}) {
  const source = Buffer.isBuffer(image) ? {type:'base64',value:image.toString('base64')}
    : typeof image === 'string' && image.startsWith('https://') ? {type:'url',value:image}
    : null;
  if (!source) throw new WorkflowRequestError('Imagem deve ser Buffer ou URL HTTPS.');
  const payload = { inputs: { [WORKFLOW.input]: source } }; // No declared runtime parameters.
  const result = await postWorkflow(
    `${BASE}/${WORKFLOW.workspace}/workflows/${WORKFLOW.id}`, key, payload, options
  );
  extractWorkflowResult(result);
  return result;
}
export async function initializeWorkflowWebRTC(offer, key, options = {}) {
  if (offer?.type !== 'offer' || typeof offer.sdp !== 'string' || offer.sdp.length < 30 || offer.sdp.length > 100000) {
    throw new WorkflowRequestError('Oferta WebRTC inválida.', 400);
  }
  // Fixed Workflow identity and output names: never accept a spec from the browser.
  const payload = {
    workflow_configuration: {
      type: 'WorkflowConfiguration',
      workspace_name: WORKFLOW.workspace,
      workflow_id: WORKFLOW.id,
      image_input_name: WORKFLOW.input,
      workflows_parameters: {},
      workflows_thread_pool_workers: 2,
      cancel_thread_pool_tasks_on_exit: true,
      video_metadata_input_name: 'video_metadata',
    },
    webrtc_realtime_processing: true,
    webrtc_offer: { sdp: offer.sdp, type: offer.type },
    webrtc_config: null,
    stream_output: [], // The saved workflow has no image-shaped output.
    data_output: [WORKFLOW.output],
    processing_timeout: 180,
    requested_plan: 'webrtc-gpu-small',
    requested_region: 'us',
  };
  const answer = await postWorkflow(`${BASE}/initialise_webrtc_worker`, key, payload, {timeoutMs:45000, ...options});
  if (typeof answer?.sdp !== 'string' || answer?.type !== 'answer') {
    throw new WorkflowRequestError('Resposta WebRTC sem SDP válido.');
  }
  return answer;
}
export async function terminateWorkflowWebRTC(pipelineId, key, options = {}) {
  if (!/^[a-z0-9_-]{8,128}$/i.test(pipelineId)) throw new WorkflowRequestError('Identificador de sessão inválido.',400);
  return postWorkflow(`${BASE}/inference_pipelines/${pipelineId}/terminate`,key,{}, {timeoutMs:12000,retries:1,...options});
}
