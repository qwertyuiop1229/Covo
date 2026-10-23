// Reproducible, offline payload/state-machine measurements. These are not
// Firebase billed reads, compressed network bytes, latency or a production bill.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../public/js/communication_runtime.js', import.meta.url), 'utf8');
const { createStatePublisher } = await import('data:text/javascript;base64,' + Buffer.from(source.replace(/^import[^\n]*\n/gm, '')).toString('base64'));
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const id = index => 'msg_' + index.toString(16).padStart(32, '0');
const body = index => ({ senderId: 'u'.repeat(28), senderNickname: '検証ユーザー', text: 'enc::v1::' + 'x'.repeat(512), timestamp: 1760000000000 + index });
const oldWire = { ...body(0), id: id(0) };
const newWire = { ...body(0), storageVersion: 2, clientProtocol: 2 };
assert.equal(bytes('検証'), 8); // JSON quotes (2) + two UTF-8 characters (6)
assert(bytes(newWire) < bytes(oldWire));

let writes = 0;
const publish = createStatePublisher(async () => { writes++; });
for (let index = 0; index < 100; index++) await publish('same-online-state', { state: 'online' });
assert.equal(writes, 1);

function retention(total, pinCount) {
  const records = Object.fromEntries(Array.from({ length: total }, (_, index) => [id(index), {
    ...body(index), storageVersion: 2, ...(index >= total - pinCount ? { isPinned: true } : {})
  }]));
  const keys = Object.fromEntries(Object.keys(records).map(key => [key, true]));
  const pinned = Object.fromEntries(Object.entries(records).filter(([, record]) => record.isPinned));
  const excess = Math.max(0, total - pinCount - 1000);
  const deletions = Math.min(excess, 100);
  const components = { firstKeys: bytes(keys), pinned: 0, oldest: 0, consistencyKeys: 0 };
  if (total > 1000) {
    components.pinned = bytes(Object.fromEntries(Object.entries(pinned).slice(0, total - 1000)));
    if (excess) {
      components.oldest = bytes(Object.fromEntries(Object.entries(records).slice(0, pinCount + deletions)));
      components.consistencyKeys = bytes(keys);
    }
  }
  const before = bytes(records), after = Object.values(components).reduce((sum, size) => sum + size, 0);
  assert.equal(Math.max(0, total - pinCount - deletions - 1000), excess - deletions);
  return { total, pinned: pinCount, expectedDeleted: deletions, remainingExcess: excess - deletions,
    selectionBeforeBytes: before, selectionAfterBytes: after, savedBytes: before - after,
    savedPercent: Number(((before - after) * 100 / before).toFixed(4)), components };
}

function allPinnedFormula(total) {
  // All fixture IDs/timestamps have the same byte length. Object entries add
  // one comma per entry after the first: n * (singleObjectBytes - 1) + 1.
  const one = { [id(0)]: { ...body(0), storageVersion: 2, isPinned: true } };
  const full = total * (bytes(one) - 1) + 1;
  const keys = total * (bytes({ [id(0)]: true }) - 1) + 1;
  const pins = (total - 1000) * (bytes(one) - 1) + 1;
  return { total, pinned: total, selectionBeforeBytes: full, selectionAfterBytes: keys + pins,
    savedBytes: full - keys - pins, savedPercent: Number(((full - keys - pins) * 100 / full).toFixed(4)),
    method: 'Closed-form fixed-width fixture; no large in-memory collection allocated.' };
}
const smallFormula = allPinnedFormula(1010), smallFixture = retention(1010, 1010);
assert.equal(smallFormula.selectionBeforeBytes, smallFixture.selectionBeforeBytes);
assert.equal(smallFormula.selectionAfterBytes, smallFixture.selectionAfterBytes);

const result = {
  scope: 'Synthetic offline fixtures; uncompressed JSON response bodies only. No headers, requests, TLS, auth, per-message checks/deletes, Firestore billing or production traffic.',
  utf8Check: { jsonStringLength: JSON.stringify('検証').length, jsonUtf8Bytes: bytes('検証') },
  sendBody: { oldRtdbBytes: bytes(oldWire), newRtdbBytes: bytes(newWire), savedRtdbBytes: bytes(oldWire) - bytes(newWire), firestoreBodyWritesBefore: 1, firestoreBodyWritesAfter: 0, excludes: 'Channel metadata transactions, notification delivery and legacy persisted outboxes.' },
  statePublisher: { identicalRequests: 100, actualWrites: writes, excludes: 'No baseline production focus count is inferred.' },
  retention: [[1000, 0], [1001, 0], [1011, 10], [1201, 0], [1010, 1010]].map(([total, pinned]) => retention(total, pinned)),
  counterexample: allPinnedFormula(100000)
};
await mkdir('scratch', { recursive: true });
await writeFile('scratch/communication-measurements.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
