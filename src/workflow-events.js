import { adaptRoboflowResponse } from '../server/roboflow.js';
// Roboflow WebRTC SDK wraps the declared workflow outputs in serialized_output_data.
// The saved workflow publishes ONLY a JsonField named "predictions".
export function parseWorkflowData(event) {
  const data = event?.serialized_output_data ?? event;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || !Object.hasOwn(item, 'predictions')) return null;
  const detection = item.predictions;
  if (!detection || !Array.isArray(detection.predictions) || !detection.image) return null;
  return adaptRoboflowResponse(detection);
}
export function createRemovalTracker({seenFrames=2,missingFrames=2,armConfidence=0.8,visibleConfidence=0.3}={}) {
  let candidate=null,armed=null,missed=0;
  return {
    reset(){candidate=null;armed=null;missed=0;},
    consume(result, alreadyRemoved=new Set()) {
      if (!result || !Array.isArray(result.predictions)) return null;
      const visible=result.predictions.filter(p=>p.card && p.confidence>=visibleConfidence && !alreadyRemoved.has(p.card));
      if(armed) {
        if (visible.some(p=>p.card===armed)) {missed=0;return null;}
        if(++missed>=missingFrames){const finished=armed;candidate=null;armed=null;missed=0;return finished;}
        return null;
      }
      const good=visible.filter(p=>p.confidence>=armConfidence).sort((a,b)=>b.confidence-a.confidence);
      // Avoid silently selecting one of multiple competing detections.
      if(good.length!==1){candidate=null;return null}
      const id=good[0].card;
      candidate=candidate?.id===id ? {id,count:candidate.count+1} : {id,count:1};
      if(candidate.count>=seenFrames){armed=id;missed=0;}
      return null;
    },
    get armedCard(){return armed;},
  };
}
