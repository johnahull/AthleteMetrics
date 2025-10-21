import { build } from 'esbuild';

await build({
  entryPoints: ['index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: '../../dist',
  packages: 'external',
  alias: {
    '@shared': '../shared'
  },
  tsconfig: './tsconfig.json'
});

console.log('✓ API build complete');
