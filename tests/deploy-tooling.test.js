const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const parser = require('@babel/parser');
const { execFile } = require('child_process');
const { promisify } = require('util');
const http = require('http');
const path = require('path');

(process.platform === 'win32' ? test : test.skip)('release gates and build scripts run in Windows PowerShell 5.1', () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/test_release_tools.ps1'], { encoding: 'utf8', timeout: 20000 });
  expect(output).toMatch(/assertions passed \(PowerShell 5\.1\./);
});

(process.platform === 'win32' ? test : test.skip)('PowerShell HTTP transport preserves status, headers and conditional GETs', async () => {
  const seen = [];
  const server = http.createServer((request, response) => {
    seen.push(request.headers);
    response.writeHead(request.headers['if-none-match'] ? 304 : 200, { ETag: '"local-tag"', 'X-RateLimit-Remaining': '55' });
    response.end(request.headers['if-none-match'] ? '' : '{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const monitorPath = path.resolve('scripts/release_monitor.ps1').replace(/'/g, "''");
    const url = `http://127.0.0.1:${server.address().port}/`;
    const script = `. '${monitorPath}'; $a=Invoke-CovoHttpGet '${url}' @{}; $b=Invoke-CovoHttpGet '${url}' @{'If-None-Match'='"local-tag"'}; @{first=$a;second=$b}|ConvertTo-Json -Depth 5 -Compress`;
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 15000 });
    const data = JSON.parse(stdout.trim());
    expect(data.first.Status).toBe(200);
    expect(data.first.Headers['X-RateLimit-Remaining']).toBe('55');
    expect(JSON.parse(data.first.Content)).toEqual({ ok: true });
    expect(data.second.Status).toBe(304);
    expect(seen[1]['if-none-match']).toBe('"local-tag"');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}, 20000);

test('timeline benchmark uses an immutable local baseline instead of Git history', () => {
  const source = fs.readFileSync('browser-tests/fixtures/timeline-before-virtualization.js', 'utf8');
  const node = parser.parse(source, { sourceType: 'module' }).program.body[0];
  expect(node.id.name).toBe('renderMessagesWithReadReceipts');
  // Hash the original declaration, independent of checkout line endings.
  const hash = crypto.createHash('sha256').update(source.slice(node.start, node.end).replace(/\r\n/g, '\n')).digest('hex');
  expect(hash).toBe('4d57472149569db349d6f918dc936f688ae70693e63ccbb32d95f0ab5751bb74');
  expect(fs.readFileSync('browser-tests/timeline.spec.cjs', 'utf8')).not.toContain('execFileSync');
});
