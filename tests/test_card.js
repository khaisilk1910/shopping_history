/* Minimal DOM-independent behavioral regression suite for WebSocket/card logic. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const elements = new Map();
global.HTMLElement = class HTMLElement { constructor() { this.isConnected = true; } };
global.customElements = {
  define: (tag, ctor) => elements.set(tag, ctor),
  get: (tag) => elements.get(tag)
};
global.window = { customCards: [] };
require(path.join(__dirname, '../custom_components/shopping_history/frontend/shopping-history-card.js'));
const Card = elements.get('shopping-history-card');
const Editor = elements.get('shopping-history-editor');
assert.ok(Card && Editor);
assert.equal(window.customCards.filter(card => card.type === 'shopping-history-card').length, 1);
assert.equal(Card.getStubConfig({}).card_height, 600);

// No browser DOM is necessary for request/model tests.
Card.prototype._ensureCardShell = function() {};
Card.prototype.renderHeaderAndTabs = function() {};
Card.prototype.renderError = function() { this.renderedError = true; };
Card.prototype.updateData = function() { this.rendered = (this.rendered || 0) + 1; };

async function run() {
  let revision = 1;
  let items = [];
  let scans = [];
  const card = new Card();
  card._config = { default_profile_id: 'p-empty' };
  card._hass = {
    states: {},
    callWS: async payload => {
      scans.push(payload);
      if (payload.type === 'shopping_history/list_profiles') return [
        { entry_id: 'p-empty', title: 'Hồ sơ trống' },
        { entry_id: 'p-two', title: 'Hồ sơ khác' },
      ];
      if (payload.type === 'shopping_history/get_data') {
        if (payload.if_revision === revision) {
          return { revision, unchanged: true };
        }
        return { revision, years: items.length ? [2026] : [], items };
      }
      throw Error('Unexpected command ' + payload.type);
    }
  };
  await card.performFullScan();
  assert.equal(card._profileList.length, 2, 'Empty profiles must be listed');
  assert.equal(card._currentProfileId, 'p-empty');
  assert.deepEqual(card._profilesData['p-empty'].items, []);
  assert.equal(card._isError, false);
  assert.equal(card._hasRealData, true);
  assert.equal(scans.length, 2, 'Only list_profiles and get_data are requested');
  assert.deepEqual(card.getGridOptions().rows, 10);

  scans = [];
  await card.performFullScan();
  assert.equal(scans.length, 2);
  assert.equal(scans[1].if_revision, 1, 'Cached revision should avoid resending all rows');
  assert.deepEqual(card._profilesData['p-empty'].items, []);

  assert.equal(card.isHassConnectionRefreshed(
    { connection: {}, connected: true }, { connection: {}, connected: true }
  ), true);
  const sameConnection = {};
  card._isError = true;
  assert.equal(card.isHassConnectionRefreshed(
    { connection: sameConnection, connected: true },
    { connection: sameConnection, connected: true }
  ), false, 'Error state alone must not trigger repeated rescans');
  card._isError = false;

  revision += 1;
  items = [{ id: 1, nam: 2026, ngay_mua: '2026-11-07', ten_hang: 'Máy tính' }];
  await card.performFullScan({ reason: 'database-updated' });
  assert.equal(card._allProfileItems.length, 0, 'stub updateData does not mutate model');
  assert.equal(card._profilesData['p-empty'].items.length, 1);
  assert.deepEqual([...card._profilesData['p-empty'].years], [2026]);

  const editor = new Editor();
  editor._backendProfiles = [{ entry_id: 'p-empty', title: 'Hồ sơ trống' }];
  assert.equal(editor.getAvailableProfilesForEditor()[0].name, 'Hồ sơ trống');
  assert.throws(() => card.setConfig(null), /không hợp lệ/);
  assert.throws(() => card.setConfig({ card_height: 50000 }), /card_height/);
  console.log('Shopping History frontend: regression checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
