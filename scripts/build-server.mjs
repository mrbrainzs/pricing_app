import { build } from 'esbuild';
await build({
  entryPoints: { server: 'ingest/src/server.ts', ingest: 'ingest/src/run.ts' },
  bundle: true, platform: 'node', target: 'node22', format: 'esm', outdir: 'build/server', outExtension: { '.js': '.mjs' },
});
