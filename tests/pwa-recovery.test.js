const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');
const main = fs.readFileSync('public/js/main.js', 'utf8');
const assignment = parser.parse(main, { sourceType: 'module' }).program.body.find(node => node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' && node.expression.left.object?.name === 'window' && node.expression.left.property?.name === 'covoRepairLoading');

for (const channel of ['dm', 'server', 'signed-out']) {
  test(`explicit repair keeps pending messages and only re-subscribes the active ${channel} scope`, async () => {
    const pending = new Map([['encrypted-message', { state: 'waiting', ciphertext: 'KEEP' }]]);
    const subscribe = jest.fn(), render = jest.fn();
    const context = vm.createContext({ window: {}, _callId: null, _isVoiceRecording: false, isSendingMessage: false, activeMigrationSession: null, _migrationSendBusy: false, _fsRole: null, _fsId: null,
      _invalidAvatars: new Set(), _avatarFailCounts: new Map(), _missingFilesSet: new Map(), _outboxEntries: pending,
      userId: channel === 'signed-out' ? null : 'alice', currentDmId: channel === 'dm' ? 'alice_bob' : null, currentServerId: channel === 'server' ? 'server' : null, currentRoomId: channel === 'server' ? 'room' : null,
      _activeChannelSessionId: 7, subscribeToMessages: subscribe, renderMessagesWithReadReceipts: render });
    vm.runInContext(main.slice(assignment.start, assignment.end), context);
    await context.window.covoRepairLoading();
    expect(pending.get('encrypted-message')).toEqual({ state: 'waiting', ciphertext: 'KEEP' });
    if (channel === 'signed-out') expect(subscribe).not.toHaveBeenCalled();
    else { expect(subscribe).toHaveBeenCalledWith({ preserve: true }); expect(context._activeChannelSessionId).toBe(8); }
  });
}

test('repair refuses to interrupt an active call before changing channel subscriptions', async () => {
  const subscribe = jest.fn();
  const context = vm.createContext({ window: {}, _callId: 'active-call', subscribeToMessages: subscribe });
  vm.runInContext(main.slice(assignment.start, assignment.end), context);
  await expect(context.window.covoRepairLoading()).rejects.toThrow('通話');
  expect(subscribe).not.toHaveBeenCalled();
});

test('a hung storage inspection terminates with partial results and does not delete any database', async () => {
  jest.useFakeTimers();
  try {
    const deleteDatabase = jest.fn();
    const context = vm.createContext({ window: {}, indexedDB: { databases: () => new Promise(() => {}), deleteDatabase }, caches: { keys: async () => ['encrypted-media'] }, localStorage: { length: 0 }, setTimeout, clearTimeout });
    vm.runInContext(fs.readFileSync('public/js/recovery_runtime.js', 'utf8').replace(/\bexport /g, ''), context);
    const result = context.inspectLocalStorage();
    await jest.advanceTimersByTimeAsync(4100);
    expect(await result).toMatchObject({ databases: null, caches: 1, partial: true });
    expect(deleteDatabase).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
