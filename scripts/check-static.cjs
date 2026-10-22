const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const files = fs.readdirSync('public/js').filter(f => f.endsWith('.js')).map(f => `public/js/${f}`)
  .concat(['server/src/index.js', 'public/firebase-messaging-sw.js']);
const errors = [];
for (const file of files) {
  const tree = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'unambiguous' });
  for (const imp of tree.program.body.filter(n => n.type === 'ImportDeclaration' && n.source.value.startsWith('.'))) {
    const target = path.resolve(path.dirname(file), imp.source.value.split('?')[0]);
    const targetTree = parser.parse(fs.readFileSync(target, 'utf8'), { sourceType: 'module' });
    const names = new Set(targetTree.program.body.filter(n => n.type === 'ExportNamedDeclaration').flatMap(n =>
      n.declaration ? (n.declaration.id ? [n.declaration.id.name] : n.declaration.declarations.map(d => d.id.name)) : n.specifiers.map(s => s.exported.name)));
    for (const spec of imp.specifiers.filter(s => s.type === 'ImportSpecifier')) {
      if (!names.has(spec.imported.name)) errors.push(`${file}: missing export ${spec.imported.name} in ${target}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Parsed ${files.length} JavaScript files; all local named imports resolve.`);
}
