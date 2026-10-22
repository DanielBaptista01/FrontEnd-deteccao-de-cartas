import test from 'node:test';
import assert from 'node:assert/strict';
import {runWorkflowImage,extractWorkflowResult,initializeWorkflowWebRTC,postWorkflow,WorkflowRequestError,WORKFLOW} from '../server/workflow-client.js';
import {adaptWorkflowResult} from '../server/workflow-client.js';

const sample=[{predictions:{image:{width:1280,height:720},predictions:[{
 width:632,height:610,x:446,y:414,confidence:0.4809814989566803,class_id:18,
 class:'5_ouros',detection_id:'220f7c54-8eeb-4ca2-99eb-d265aa2792ee',parent_id:'image'
}]}}]; // Abridged real Roboflow MCP workflows_run output, collected from the test split.
test('smoke: saved Workflow output name and nested detections match real sample',()=>{
 assert.ok(Object.hasOwn(sample[0],WORKFLOW.output));
 assert.equal(extractWorkflowResult(sample).predictions[0].class,'5_ouros');
 const result=adaptWorkflowResult(sample);
 assert.equal(result.card,'5-diamonds');
 assert.equal(result.confidence,sample[0].predictions.predictions[0].confidence);
 assert.equal(result.predictions[0].x,446);
});
test('one-image client sends only declared image input with header auth',async()=>{
 let called=0;
 const fetchImpl=async(url,init)=>{
  called++;
  assert.equal(url,`https://serverless.roboflow.com/${WORKFLOW.workspace}/workflows/${WORKFLOW.id}`);
  assert.equal(init.headers.Authorization,'Bearer fake-secret');
  assert.equal(init.headers['Content-Type'],'application/json');
  const body=JSON.parse(init.body);
  assert.deepEqual(Object.keys(body),['inputs']);
  assert.equal(body.inputs.image.type,'base64');
  assert.equal(body.inputs.image.value,Buffer.from('abc').toString('base64'));
  assert.equal(JSON.stringify(body).includes('fake-secret'),false);
  return {ok:true,status:200,text:async()=>JSON.stringify(sample)};
 };
 const result=await runWorkflowImage(Buffer.from('abc'),'fake-secret',{fetchImpl});
 assert.equal(called,1);assert.equal(result[0].predictions.predictions[0].class,'5_ouros');
});
test('WebRTC signaling cannot override saved workflow or leak key into body',async()=>{
 let calls=0;
 const answer=await initializeWorkflowWebRTC({type:'offer',sdp:'v=0\r\na=group:BUNDLE video-data example'},'fake-secret',{
   fetchImpl:async(url,init)=>{
     calls++;
     assert.equal(url,'https://serverless.roboflow.com/initialise_webrtc_worker');
     assert.equal(init.headers.Authorization,'Bearer fake-secret');
     const body=JSON.parse(init.body);
     assert.equal(body.workflow_configuration.workflow_id,WORKFLOW.id);
     assert.equal(body.workflow_configuration.workspace_name,WORKFLOW.workspace);
     assert.deepEqual(body.workflow_configuration.workflows_parameters,{});
     assert.deepEqual(body.data_output,['predictions']);
     assert.deepEqual(body.stream_output,[]);
     assert.equal(JSON.stringify(body).includes('fake-secret'),false);
     assert.equal(body.processing_timeout,180);
     return {ok:true,status:200,text:async()=>JSON.stringify({type:'answer',sdp:'v=0',context:{pipeline_id:'test-pipeline'}})};
   }
 });
 assert.equal(calls,1);assert.equal(answer.type,'answer');
});
test('transient upstream failures retry with backoff',async()=>{
 let calls=0,delays=[];
 const result=await postWorkflow('https://serverless.roboflow.com/test','fake-secret',{inputs:{}},{
  fetchImpl:async()=>++calls===1?{ok:false,status:503,json:async()=>({message:'temporarily unavailable'})}:{ok:true,status:200,text:async()=>JSON.stringify({ok:true})},
  sleepImpl:async ms=>delays.push(ms),
 });
 assert.deepEqual(result,{ok:true});assert.equal(calls,2);assert.deepEqual(delays,[250]);
});
test('bad authorization fails without retries and throws typed error',async()=>{
 let calls=0;
 await assert.rejects(
  postWorkflow('https://serverless.roboflow.com/test','fake-secret',{},{
   fetchImpl:async()=>{calls++;return {ok:false,status:401,json:async()=>({message:'unauthorized'})}}
  }),
  error=>error instanceof WorkflowRequestError && error.status===401 && !error.retryable
 );
 assert.equal(calls,1);
});
test('live smoke: run saved Workflow with a real dataset image (requires private key)',{
 skip:!process.env.ROBOFLOW_API_KEY
},async()=>{
 const result=await runWorkflowImage(
  'https://source.roboflow.com/6GXPl1qdV0b8JvEqdE1D/AlsWIdoKQeIGQKJ291uQ/original.jpg',
  process.env.ROBOFLOW_API_KEY,
 );
 assert.ok(Array.isArray(result));
 assert.ok(Object.hasOwn(result[0],WORKFLOW.output));
 assert.ok(Array.isArray(extractWorkflowResult(result).predictions));
});
