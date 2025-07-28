export default {
  context: {
    tsconfig: "./tsconfig.json",
    entryPoints: ["src/index.ts"],
    bundle: true,
    outfile: "dist/index.js",
    platform: "node",
    target: "es2020",
    format: "esm",
    define: { "import.meta.url": "import.meta.url" },
    banner: {
      js: `const _importMetaUrl = new URL(import.meta.url).pathname;`,
    },
    external: ["commander", "dockerode", "dotenv", "ethers", "inquirer", "update-check", "ssh2", "fs-extra", "esbuild", "keytar"]
  },
  watch: true,
};
