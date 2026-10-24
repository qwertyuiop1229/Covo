const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const parser = require('@babel/parser');

(process.platform === 'win32' ? test : test.skip)('release gates and build scripts run in Windows PowerShell 5.1', () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/test_release_tools.ps1'], { encoding: 'utf8', timeout: 20000 });
  expect(output).toMatch(/assertions passed \(PowerShell 5\.1\./);
});

test('timeline benchmark uses an immutable local baseline instead of Git history', () => {
  const source = fs.readFileSync('browser-tests/fixtures/timeline-before-virtualization.js', 'utf8');
  const node = parser.parse(source, { sourceType: 'module' }).program.body[0];
  expect(node.id.name).toBe('renderMessagesWithReadReceipts');
  // Hash the original declaration, independent of checkout line endings.
  const hash = crypto.createHash('sha256').update(source.slice(node.start, node.end).replace(/\r\n/g, '\n')).digest('hex');
  expect(hash).toBe('4d57472149569db349d6f918dc936f688ae70693e63ccbb32d95f0ab5751bb74');
  expect(fs.readFileSync('browser-tests/timeline.spec.cjs', 'utf8')).not.toContain('execFileSync');
});
