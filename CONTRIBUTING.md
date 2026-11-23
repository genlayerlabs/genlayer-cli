# Contributing to GenLayer CLI

We're thrilled that you're interested in contributing to the GenLayer CLI! This document will guide you through the contribution process.

## What is the GenLayer CLI?

The GenLayer CLI is a command-line tool designed to:
1. Streamline the setup and local execution of the GenLayer simulator. It automates the process of downloading and launching the GenLayer simulator, making it easy to start simulating and testing locally with minimal setup.
2. Deploy Intelligent Contracts on any network, read their state and send transactions to them.
3. Perform Validators operations

## How You Can Contribute?

Contributions to the GenLayer CLI are welcome in several forms:

### Testing the CLI and Providing Feedback

Help us make the CLI better by testing and giving feedback:

- Start by installing the CLI globally using the command:
  ```sh
  $ npm install -g genlayer
  ```
- Try out the CLI features and tell us what you think through our [feedback form](https://forms.gle/ZbbxHsZrJxKucurB7) or on our [Discord Channel](https://discord.gg/8Jm4v89VAu).
- If you find any issues, please report them on our [GitHub issues page](https://github.com/yeagerai/genlayer-cli/issues).

### Sharing New Ideas and Use Cases

Have ideas for new features or use cases? We're eager to hear them! But first:

- Ensure you have the CLI installed to explore existing functionality.
- After familiarizing yourself with the CLI, contribute your unique use case and share your ideas in our [Discord channel](https://discord.gg/8Jm4v89VAu).

## Branch model

See [docs/BRANCHING.md](docs/BRANCHING.md) for the current release-train model.
In short: every change targets the `*-dev` integration branch of its line, and
that branch is promoted to the matching stable branch by `scripts/release.sh
--promote` when a release is ready. PRs do not target a stable branch directly.
`main` is only the default/static GitHub branch.

The previous `staging` branch (beta channel) has been retired. Pre-releases now go through the same release script with an explicit version (`scripts/release.sh 0.40.1-rc.1` on `v0.40-dev`).

## Releases

Releases are deliberate, not automatic. Every release commit is made on the `*-dev` branch of its line by `scripts/release.sh`, which bumps the version and updates `CHANGELOG.md`; CI takes over from the tag push and publishes to npm.

- **Release candidate** (one step): `scripts/release.sh 0.40.1-rc.1` on `v0.40-dev` commits, tags and pushes.
- **Final** (two steps, with a merge hold in between):
  1. `scripts/release.sh 0.40.1` on `v0.40-dev` pushes the release commit without a tag. That commit is the head of the promotion PR `v0.40-dev` → `v0.40`, so `CI Workflow` and `E2E Tests` run on it. From this push until step 2 is done, nothing else merges into `v0.40-dev`: a commit that lands after the release commit forces a new release commit and a new E2E run.
  2. Once both are green on that commit, `scripts/release.sh --promote 0.40.1` fast-forwards `v0.40` to it with a plain push and tags it.

Only `--promote` lands the promotion PR. Never use the merge button, GitHub auto-merge, the E2E app's merge train (`/merge-train` or its merge action) or the Legatus self-merge loop on it: this repo only allows squash merges, and a squash commit is a commit `E2E Tests` did not run on that also breaks ancestry between the two branches. The fast-forward closes the PR as merged.

The stable branch only accepts commits that already have a green `E2E Tests` check, which is why the version bump happens on dev before promotion and not on the stable branch after it. `--dry-run` runs the checks of any of these commands without changing anything; options are accepted before or after the version (`scripts/release.sh --dry-run 0.40.1`). Call the script directly: `npm run release` drops options unless they follow `--`, and the script refuses to run when that happens. See `.claude/skills/release/SKILL.md` for the full flow.

**Semver-zero rule**: this package is on 0.x, so minor IS the breaking-change boundary. `0.40 → 0.41` is a major bump and needs a new branch pair — the script refuses it without `--allow-major`.

### Bug fixing and Feature development

#### 1. Set yourself up to start coding

- **1.1. Pick an issue**: Select one from the project GitHub repository [issue list](https://github.com/yeagerai/genlayer-cli/issues) and assign it to yourself.

- **1.2. Create a branch**: create the branch that you will work on by using the link provided in the issue details page (right panel at the bottom - section "Development")

- **1.3. Setup the CLI locally**: clone the repository and install dependencies

   ```sh
   $ git clone https://github.com/yeagerai/genlayer-cli.git
   $ cd genlayer-cli
   $ npm install
   ```

- **1.4. Run the CLI in dev mode**: to run the CLI in development mode with hot reload enabled:

   ```sh
   $ npm run dev
   ```

- **1.5. Test the CLI locally**: to test the CLI commands locally during development:

   ```sh
   $ node dist/index.js <command>
   ```

   For example:
   ```sh
   $ node dist/index.js init
   $ node dist/index.js up
   $ node dist/index.js validators get
   ```

- **1.6. Run unit tests**:
The GenLayer CLI uses [Vitest](https://vitest.dev/) to test its TypeScript files. Vitest runs the TypeScript sources directly, so the tests need no separate transform step.

##### Running Tests

To run the tests, use the following command:

```bash
npm run test
```

This runs `vitest` in watch mode, which re-runs the affected tests when files change, making it suitable for development. For a single run (as in CI), use `npx vitest run`. Other scripts:

- `npm run test:watch`: explicit watch mode.
- `npm run test:coverage`: a single run with coverage (`@vitest/coverage-v8`).
- `npm run test:smoke`: the smoke tests, using `vitest.smoke.config.ts`.

##### Test Configuration

Our `vitest.config.ts` is set up as follows:

- Globals: `describe`, `test`, `expect` and `vi` are available without imports (`globals: true`).
- Test Environment: `jsdom`.
- Setup: `tests/setup.ts` runs before each test file.
- Timeout: 10 seconds per test.
- Excluded: `tests/smoke.test.ts` (run through `test:smoke`) and `e2e/**`.

Tests are located in the tests/ directory and should be named using the following pattern: [filename].test.ts. When writing tests, you can use all Vitest functionalities such as describe, test, expect, and mocks (`vi.fn()`, `vi.mock()`, `vi.spyOn()`) for testing asynchronous functions, component interactions, or API calls.

#### 2. Submit your solution

- **2.1. Prettier Formatter on Save File**: Configure IDE extensions to format your code with [Prettier](https://prettier.io/) before submitting it.
- **2.2. Code solution**: implement the solution in the code.
- **2.3. Run tests**: Ensure all tests pass before submitting:
   ```sh
   $ npm run test
   ```
- **2.4. Pull Request**: Submit your changes through a pull request (PR). Fill the entire PR template and set the PR title as a valid conventional commit.
- **2.5. Check PR and issue linking**: if the issue and the PR are not linked, you can do it manually in the right panel of the Pull Request details page.  
- **2.6. Peer Review**: One or more core contributors will review your PR. They may suggest changes or improvements.
- **2.7. Approval and Merge**: After approval from the reviewers, you can merge your PR with a squash and merge type of action.


### Improving Documentation

To contribute to our docs, visit our [Documentation Repository](https://github.com/yeagerai/genlayer-docs) to create new issues or contribute to existing issues.

## Community

Connect with the GenLayer community to discuss, collaborate, and share insights:

- **[Discord Channel](https://discord.gg/8Jm4v89VAu)**: Our primary hub for discussions, support, and announcements.
- **[Telegram Group](https://t.me/genlayer)**: For more informal chats and quick updates.

Your continuous feedback drives better product development. Please engage with us regularly to test, discuss, and improve the GenLayer CLI.
