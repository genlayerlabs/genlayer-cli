#!/usr/bin/env node

const mode = process.argv[2] ?? 'development';

if (!['development', 'production'].includes(mode)) {
  console.error(`Unsupported build mode: ${mode}`);
  process.exit(1);
}

process.env.NODE_ENV = mode;

await import('../esbuild.config.js');
