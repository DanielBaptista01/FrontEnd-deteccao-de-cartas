import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkflowData,createRemovalTracker} from '../src/workflow-events.js';

const report=(cls='5_ouros',confidence=0.91)=>({predictions:{
 image:{width:640,height:480},
 predictions:cls?[{class:cls,confidence,x:250,y:220,width:100,height:160}]:[]
}});
test('WebRTC SDK data channel wrapper uses saved output key',()=>{
 const parsed=parseWorkflowData({serialized_output_data:report()});
 assert.equal(parsed.card,'5-diamonds');
 assert.equal(parsed.predictions[0].width,100);
 assert.equal(parseWorkflowData({serialized_output_data:{other:{}}}),null);
});
test('confirmation only after two strong sightings and two frames absent',()=>{
 const tracker=createRemovalTracker();
 const seen=parseWorkflowData({serialized_output_data:report()});
 const empty=parseWorkflowData({serialized_output_data:report(null)});
 assert.equal(tracker.consume(seen),null);
 assert.equal(tracker.consume(seen),null);
 assert.equal(tracker.armedCard,'5-diamonds');
 assert.equal(tracker.consume(seen),null);
 assert.equal(tracker.consume(empty),null);
 assert.equal(tracker.consume(empty),'5-diamonds');
});
test('weak/misclassified frames cannot arm removal',()=>{
 const tracker=createRemovalTracker();
 const weak=parseWorkflowData({serialized_output_data:report('5_ouros',0.48)});
 assert.equal(tracker.consume(weak),null);assert.equal(tracker.consume(weak),null);
 assert.equal(tracker.armedCard,null);
});
test('already removed card cannot be recorded twice',()=>{
 const tracker=createRemovalTracker(),removed=new Set(['5-diamonds']);
 const seen=parseWorkflowData({serialized_output_data:report()});
 assert.equal(tracker.consume(seen,removed),null);assert.equal(tracker.consume(seen,removed),null);
 assert.equal(tracker.armedCard,null);
});
test('singular Roboflow 5_espada label maps correctly',()=>{
 const parsed=parseWorkflowData({serialized_output_data:report('5_espada')});
 assert.equal(parsed.card,'5-spades');
});
