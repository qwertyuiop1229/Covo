import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('.cache/firebase', { recursive: true });
for (const name of ['app', 'auth', 'storage', 'messaging']) {
  await writeFile(`.cache/firebase/firebase-${name}.js`, `export * from 'firebase-runtime/${name}';\n`);
}
const firebaseBuild = await build({
  entryPoints: {
    'firebase-app': '.cache/firebase/firebase-app.js',
    'firebase-auth': '.cache/firebase/firebase-auth.js',
    'firebase-storage': '.cache/firebase/firebase-storage.js',
    'firebase-messaging': '.cache/firebase/firebase-messaging.js',
    'firebase-firestore': 'scripts/firebase-entry.mjs',
    'firebase-database': 'scripts/database-entry.mjs'
  },
  outdir: 'public/vendor/firebase', bundle: true, splitting: true,
  format: 'esm', platform: 'browser', target: ['safari15', 'chrome100'], minify: true, metafile: true,
  external: ['../../js/communication_runtime.js'],
  plugins: [{ name: 'shared-local-metrics', setup(b) {
    b.onResolve({ filter: /communication_runtime\.js$/ }, () => ({ path: '../../js/communication_runtime.js', external: true }));
  } }]
});
await writeFile('.cache/firebase/metafile.json', JSON.stringify(firebaseBuild.metafile, null, 2));

await build({ entryPoints: ['node_modules/@tauri-apps/plugin-updater/dist-js/index.js'], outfile: 'public/vendor/desktop-updater.js', bundle: true, format: 'esm', minify: true });
