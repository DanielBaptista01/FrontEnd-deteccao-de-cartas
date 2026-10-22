import { connectors, webrtc } from '@roboflow/inference-sdk';
import { parseWorkflowData } from './workflow-events.js';
// The key lives on the Express server; the browser only exchanges SDP via proxy.
export async function startWorkflowWebRTC(stream, {onData,onState}={}) {
  const base = connectors.withProxyUrl('/api/init-webrtc');
  let pipelineId = null;
  const connector = {
    connectWrtc: async (offer, params) => {
      const answer = await base.connectWrtc(offer, params);
      pipelineId = answer?.context?.pipeline_id ?? null;
      return answer;
    },
  };
  const connection=await webrtc.useStream({
    source:stream, connector,
    wrtcParams:{
      workspaceName:'cardsdetection-pwqty',
      workflowId:'cards-vcards-ksgh0-2-rfdetr-small-t1-logic',
      imageInputName:'image',dataOutputNames:['predictions'],
      streamOutputNames:[], workflowsParameters:{},
      processingTimeout:180,requestedPlan:'webrtc-gpu-small',requestedRegion:'us',
    },
    onData:event=>{
      if(event?.errors?.length){onState?.('O Roboflow retornou um erro durante a detecção.');return;}
      const parsed=parseWorkflowData(event);
      if(parsed)onData?.(parsed);
    },
    hooks:{onPeerConnectionCreated:pc=>{
      pc.addEventListener('connectionstatechange',()=>{
        if(['failed','disconnected','closed'].includes(pc.connectionState)){
          onState?.(`WebRTC: ${pc.connectionState}`);
        }
      });
    }},
  });
  return {
    async stop(){
      // Close local media/peer first; server endpoint terminates the GPU session.
      await connection.cleanup();
      if (pipelineId) {
        const response=await fetch('/api/stop-webrtc',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({pipelineId}),signal:AbortSignal.timeout(12000),
          keepalive:true,
        });
        if(!response.ok)throw new Error('Não foi possível confirmar o encerramento remoto.');
      }
    }
  };
}
