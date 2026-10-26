import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import {cacheMatches,recordCache} from './dev_build_cache.mjs';
import {assertSecretSafety} from './check_secret_safety.mjs';
await assertSecretSafety();
const cacheFile='.cache/firebase/build-state.json';
const required=['scripts/build_firebase.mjs','scripts/dev_build_cache.mjs','scripts/firebase-entry.mjs','scripts/database-entry.mjs','package.json','package-lock.json'];
await mkdir('.cache/firebase', { recursive: true });
if(process.argv.includes('--if-needed') && await cacheMatches(cacheFile,required)) {
  await (await import('./build_css_modules.mjs')).stampCssImports();
  console.log('[dev] Firebase/updater bundles unchanged; reused verified output.');
  process.exit(0);
}
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

const desktopBuild=await build({ entryPoints: ['node_modules/@tauri-apps/plugin-updater/dist-js/index.js'], outfile: 'public/vendor/desktop-updater.js', bundle: true, format: 'esm', minify: true, metafile:true });
const photoBuild=await build({ entryPoints: ['node_modules/photoswipe/dist/photoswipe.esm.js'], outfile: 'public/vendor/photoswipe.js', bundle: true, format: 'esm', minify: true, metafile:true });
await copyFile('node_modules/photoswipe/dist/photoswipe.css','public/vendor/photoswipe.css');
await copyFile('node_modules/photoswipe/LICENSE','public/vendor/photoswipe.LICENSE');
await (await import('./build_css_modules.mjs')).stampCssImports();
await recordCache(cacheFile,[...required,...Object.keys(firebaseBuild.metafile.inputs),...Object.keys(firebaseBuild.metafile.outputs),...Object.keys(desktopBuild.metafile.inputs),...Object.keys(desktopBuild.metafile.outputs),...Object.keys(photoBuild.metafile.inputs),...Object.keys(photoBuild.metafile.outputs),'node_modules/photoswipe/dist/photoswipe.css','node_modules/photoswipe/LICENSE','public/vendor/photoswipe.css','public/vendor/photoswipe.LICENSE']);
