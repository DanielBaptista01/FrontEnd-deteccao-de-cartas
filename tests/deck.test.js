import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK, normalizeCard, probabilities } from '../src/deck.js';
test('baralho possui 52 cartas únicas',()=>{assert.equal(DECK.length,52);assert.equal(new Set(DECK.map(card=>card.id)).size,52)});
test('probabilidades iniciais correspondem a 52 cartas',()=>{const p=probabilities();assert.equal(p.total,52);assert.equal(p.cards[0].probability,100/52);assert.deepEqual(p.suits.map(s=>s.probability),[25,25,25,25]);assert.deepEqual(p.colors.map(c=>c.probability),[50,50]);});
test('a remoção do ás de espadas altera a contagem corretamente',()=>{const p=probabilities(['A-spades']);assert.equal(p.total,51);assert.equal(p.cards.find(c=>c.id==='A-spades').probability,0);assert.equal(p.cards.find(c=>c.id==='2-spades').probability,100/51);assert.equal(p.suits.find(s=>s.id==='spades').count,12);assert.equal(p.colors.find(c=>c.color==='black').count,25);assert.equal(p.colors.find(c=>c.color==='red').count,26);});
test('remoções duplicadas não diminuem o total',()=>assert.equal(probabilities(['A-spades','A-spades']).total,51));
test('baralho esgotado não divide por zero',()=>{const p=probabilities(DECK.map(c=>c.id));assert.equal(p.total,0);assert.ok(p.cards.every(c=>c.probability===0));assert.ok(p.suits.every(s=>s.probability===0))});
test('normalização aceita nomes e notações usuais',()=>{assert.equal(normalizeCard('AS').id,'A-spades');assert.equal(normalizeCard({rank:'10',suit:'hearts'}).id,'10-hearts');assert.equal(normalizeCard('rei-paus').id,'K-clubs');assert.equal(normalizeCard('XYZ'),null)});
