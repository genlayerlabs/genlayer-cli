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
The GenLayer CLI uses Jest in combination with ts-jest to handle testing of TypeScript files. The configuration is tailored to support ES Modules (ESM), aligning with the latest JavaScript standards and ensuring compatibility with modern tooling and Node.js features.

##### Running Tests

To run the tests, use the following command:

```bash
npm run test
```

This command sets the appropriate Node.js options to handle ES Modules and watches for changes in the test files, making it suitable for development.

##### Test Configuration

Our `jest.config.js` is set up as follows:

- ES Module Support: Configured to treat .ts files as ES Modules.
- Test Environment: Uses Node.js as the testing environment.
- Transformation: Utilizes ts-jest with an ESM preset to process TypeScript files.

Tests are located in the tests/ directory and should be named using the following pattern: [filename].test.ts. When writing tests, you can use all Jest functionalities such as describe, test, expect, and Jest mocks for testing asynchronous functions, component interactions, or API calls.

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