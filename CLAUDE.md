# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm install          # Install dependencies
npm run dev          # Watch mode development build (uses esbuild)
npm run build        # Production build
node dist/index.js   # Run CLI from source
```

## Testing

```bash
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npx vitest tests/commands/deploy.test.ts  # Single test file
npx vitest -t "test name pattern"         # Run specific test by name
```

## Architecture

### Entry Point & Command Structure
- `src/index.ts` - Main entry, initializes Commander program and registers all command groups
- Commands organized in `src/commands/<domain>/index.ts` - each exports `initialize*Commands(program)` function
- Command domains: general (init/up/stop), account, contracts, config, localnet, update, scaffold, network, transactions, staking

### Core Classes
- `BaseAction` (`src/lib/actions/BaseAction.ts`) - Base class for all CLI actions. Provides:
  - GenLayer client initialization via `genlayer-js` SDK
  - Keystore management (encrypted wallet with password)
  - Spinner/logging utilities (ora, chalk)
  - User prompts (inquirer)
- `ConfigFileManager` (`src/lib/config/ConfigFileManager.ts`) - Manages `~/.genlayer/genlayer-config.json`
- `KeychainManager` (`src/lib/config/KeychainManager.ts`) - System keychain integration via keytar

### Pattern for Adding Commands
1. Create action class extending `BaseAction` in `src/commands/<domain>/<action>.ts`
2. Export action options interface
3. Register in domain's `index.ts` via Commander
4. Add tests in `tests/commands/<domain>.test.ts` and `tests/actions/<action>.test.ts`

### External Dependencies
- `commander` - CLI framework
- `genlayer-js` - GenLayer SDK for blockchain interactions
- `ethers` - Wallet/keystore encryption
- `dockerode` - Docker management for localnet
- `viem` - Ethereum utilities

### Path Aliases
- `@/*` → `./src/*`
- `@@/tests/*` → `./tests/*`
