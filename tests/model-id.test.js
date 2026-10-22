import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidModelId } from '../server/model-id.js';

test('accepts current workspace/model slug identifiers', () => {
  assert.equal(isValidModelId('my-workspace/cards-ksgh0-2-rfdetr-small-t1'), true);
});
test('accepts legacy project/version aliases for compatibility', () => {
  assert.equal(isValidModelId('cards-ksgh0/2'), true);
});
test('rejects unsafe or malformed identifiers', () => {
  for (const id of ['', 'cards-ksgh0-2-rfdetr-small-t1', 'workspace/', '/model', 'workspace/../../abc', 'workspace/model?api_key=key']) {
    assert.equal(isValidModelId(id), false, id);
  }
});
