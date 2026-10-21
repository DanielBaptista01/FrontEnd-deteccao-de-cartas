import test from 'node:test';
import assert from 'node:assert/strict';
import { cardFromClass, adaptRoboflowResponse } from '../server/roboflow.js';

test('suporta rótulos convencionais de cartas', () => {
  assert.equal(cardFromClass('3_of_clubs')?.id, '3-clubs');
  assert.equal(cardFromClass('3 of clubs')?.id, '3-clubs');
  assert.equal(cardFromClass('AS')?.id, 'A-spades');
  assert.equal(cardFromClass('Queen of Hearts')?.id, 'Q-hearts');
  assert.equal(cardFromClass('rei-de-paus')?.id, 'K-clubs');
});
test('permite mapa customizado para nomes de classe específicos', () => {
  assert.equal(cardFromClass('minha_classe_1', { minha_classe_1: '10-diamonds' })?.id, '10-diamonds');
});
test('mantém caixas e confiança para a melhor detecção válida', () => {
  const result = adaptRoboflowResponse({image:{width:640,height:480},predictions:[
    {class:'object',confidence:0.9,x:5,y:7,width:60,height:80},
    {class:'3_of_clubs',confidence:0.86,x:200,y:220,width:100,height:150}
  ]});
  assert.equal(result.card,'3-clubs');assert.equal(result.confidence,0.86);
  assert.equal(result.image.width,640);assert.equal(result.predictions[1].width,100);
  assert.deepEqual(result.unknownClasses,['object']);
});
test('não inventa carta caso dataset tenha apenas classe genérica', () => {
  const result=adaptRoboflowResponse({predictions:[{class:'Cards',confidence:0.99}]});
  assert.equal(result.card,null);assert.equal(result.confidence,0);
});
