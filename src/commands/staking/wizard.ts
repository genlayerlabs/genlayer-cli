import {StakingAction, StakingConfig, BUILT_IN_NETWORKS} from "./StakingAction";
import {CreateAccountAction} from "../account/create";
import {ExportAccountAction} from "../account/export";
import inquirer from "inquirer";
import type {Address} from "genlayer-js/types";
import {formatEther, parseEther} from "viem";
import {createClient} from "genlayer-js";
import {readFileSync, existsSync} from "fs";
import path from "path";

export interface WizardOptions extends StakingConfig {
  skipIdentity?: boolean;
}

interface WizardState {
  accountName: string;
  accountAddress: string;
  networkAlias: string;
  balance: bigint;
  minStake: bigint;
  operatorAddress?: string;
  operatorAccountName?: string; // if operator is a CLI account
  operatorKeystorePath?: string;
  stakeAmount: string;
  validatorWalletAddress?: string; // the validator contract address returned from validatorJoin
  identity?: {
    moniker: string;
    logoUri?: string;
    website?: string;
    description?: string;
    email?: string;
    twitter?: string;
    telegram?: string;
    github?: string;
  };
}

// Ensure address has 0x prefix
function ensureHexPrefix(address: string): string {
  if (!address) return address;
  return address.startsWith("0x") ? address : `0x${address}`;
}

export class ValidatorWizardAction extends StakingAction {
  constructor() {
    super();
  }

  async execute(options: WizardOptions): Promise<void> {
    console.log("\n========================================");
    console.log("   GenLayer Validator Setup Wizard");
    console.log("========================================\n");

    const state: Partial<WizardState> = {};

    try {
      // Step 1: Account Setup
      await this.stepAccountSetup(state, options);

      // Step 2: Network Selection
      await this.stepNetworkSelection(state, options);

      // Step 3: Balance Check
      await this.stepBalanceCheck(state, options);

      // Step 4: Operator Setup
      await this.stepOperatorSetup(state);

      // Step 5: Stake Amount
      await this.stepStakeAmount(state);

      // Step 6: Join as Validator
      await this.stepJoinValidator(state, options);

      // Step 7: Identity Setup
      if (!options.skipIdentity) {
        await this.stepIdentitySetup(state, options);
      }

      // Step 8: Summary
      this.showSummary(state as WizardState);
    } catch (error: any) {
      if (error.message === "WIZARD_ABORTED") {
        this.logError("Wizard aborted.");
        return;
      }
      this.failSpinner("Wizard failed", error.message || error);
    }
  }

  private async stepAccountSetup(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 1: Account Setup");
    console.log("---------------------\n");

    // Check if account override provided
    if (options.account) {
      const keystorePath = this.getKeystorePath(options.account);
      if (!this.accountExists(options.account)) {
        this.failSpinner(`Account '${options.account}' not found.`);
      }
      state.accountName = options.account;
      this.accountOverride = options.account;
      const address = await this.getSignerAddress();
      state.accountAddress = ensureHexPrefix(address);
      console.log(`Using account: ${options.account} (${state.accountAddress})\n`);
      return;
    }

    const accounts = this.listAccounts();

    if (accounts.length === 0) {
      // No accounts exist, create one
      console.log("No accounts found. Let's create one.\n");
      const {accountName} = await inquirer.prompt([
        {
          type: "input",
          name: "accountName",
          message: "Enter a name for your validator account:",
          default: "validator",
          validate: (input: string) => input.length > 0 || "Name cannot be empty",
        },
      ]);

      const createAction = new CreateAccountAction();
      await createAction.execute({name: accountName, overwrite: false, setActive: true});

      state.accountName = accountName;
      this.accountOverride = accountName;
      const address = await this.getSignerAddress();
      state.accountAddress = ensureHexPrefix(address);
    } else {
      // Accounts exist, choose or create
      const choices = [
        ...accounts.map(a => ({
          name: `${a.name} (${a.address})`,
          value: a.name,
        })),
        {name: "Create new account", value: "__create_new__"},
      ];

      const {selectedAccount} = await inquirer.prompt([
        {
          type: "list",
          name: "selectedAccount",
          message: "Select an account that will be the owner of the validator:",
          choices,
        },
      ]);

      if (selectedAccount === "__create_new__") {
        const {accountName} = await inquirer.prompt([
          {
            type: "input",
            name: "accountName",
            message: "Enter a name for your validator account:",
            default: "validator",
            validate: (input: string) => {
              if (input.length === 0) return "Name cannot be empty";
              if (accounts.find(a => a.name === input)) return "Account with this name already exists";
              return true;
            },
          },
        ]);

        const createAction = new CreateAccountAction();
        await createAction.execute({name: accountName, overwrite: false, setActive: true});

        state.accountName = accountName;
        this.accountOverride = accountName;
        const address = await this.getSignerAddress();
        state.accountAddress = ensureHexPrefix(address);
      } else {
        state.accountName = selectedAccount;
        this.accountOverride = selectedAccount;
        this.setActiveAccount(selectedAccount);
        const address = await this.getSignerAddress();
        state.accountAddress = ensureHexPrefix(address);
        console.log(`\nUsing account: ${selectedAccount} (${state.accountAddress})`);
      }
    }

    console.log("");
  }

  private async stepNetworkSelection(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 2: Network Selection");
    console.log("-------------------------\n");

    if (options.network) {
      const network = BUILT_IN_NETWORKS[options.network];
      if (!network) {
        this.failSpinner(`Unknown network: ${options.network}`);
      }
      state.networkAlias = options.network;
      this.writeConfig("network", options.network);
      console.log(`Using network: ${network.name}\n`);
      return;
    }

    const currentNetwork = this.getConfigByKey("network");
    // Exclude studionet - not compatible with staking
    const excludedNetworks = ["studionet"];
    const networks = Object.entries(BUILT_IN_NETWORKS)
      .filter(([alias]) => !excludedNetworks.includes(alias))
      .map(([alias, chain]) => ({
        name: chain.name,
        value: alias,
      }));

    const {selectedNetwork} = await inquirer.prompt([
      {
        type: "list",
        name: "selectedNetwork",
        message: "Select network:",
        choices: networks,
        default: currentNetwork || "testnet-asimov",
      },
    ]);

    state.networkAlias = selectedNetwork;
    this.writeConfig("network", selectedNetwork);
    console.log(`\nNetwork set to: ${BUILT_IN_NETWORKS[selectedNetwork].name}\n`);
  }

  private async stepBalanceCheck(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 3: Balance Check");
    console.log("---------------------\n");

    this.startSpinner("Checking balance and staking requirements...");

    const network = BUILT_IN_NETWORKS[state.networkAlias!];
    const client = createClient({
      chain: network,
      account: state.accountAddress as Address,
      endpoint: options.rpc,
    });

    const [balance, epochInfo] = await Promise.all([
      client.getBalance({address: state.accountAddress as Address}),
      client.getEpochInfo(),
    ]);

    this.stopSpinner();

    const balanceFormatted = formatEther(balance);
    const minStakeRaw = epochInfo.validatorMinStakeRaw;
    const minStakeFormatted = epochInfo.validatorMinStake;
    const currentEpoch = epochInfo.currentEpoch;

    // Minimum gas buffer for transaction fees (~0.01 GEN)
    const MIN_GAS_BUFFER = parseEther("0.01");

    console.log(`Balance: ${balanceFormatted} GEN`);
    console.log(`Minimum stake required: ${minStakeFormatted}`);
    if (currentEpoch === 0n) {
      console.log("(Epoch 0: minimum stake not enforced, but gas fees still required)");
      console.log(`Note: Validator won't become active until self-stake reaches ${minStakeFormatted}`);
    }

    // Always need gas, plus stake requirement after Epoch 0
    const minRequired = currentEpoch === 0n ? MIN_GAS_BUFFER : minStakeRaw + MIN_GAS_BUFFER;

    if (balance < minRequired) {
      console.log("");
      const minFormatted = currentEpoch === 0n ? "0.01 GEN (for gas)" : `${minStakeFormatted} + gas`;
      this.failSpinner(
        `Insufficient balance. You need at least ${minFormatted} to become a validator.\n` +
          `Fund your account (${state.accountAddress}) and run the wizard again.`
      );
    }

    state.balance = balance;
    state.minStake = currentEpoch === 0n ? 0n : minStakeRaw;

    console.log("Balance sufficient!\n");
  }

  private async stepOperatorSetup(state: Partial<WizardState>): Promise<void> {
    console.log("Step 4: Operator Setup");
    console.log("----------------------\n");

    console.log("Using a separate operator address is recommended for security:");
    console.log("- Owner account: holds staked funds (keep secure)");
    console.log("- Operator account: signs blocks (hot wallet on validator server)\n");

    const {useOperator} = await inquirer.prompt([
      {
        type: "confirm",
        name: "useOperator",
        message: "Do you want to use a separate operator address?",
        default: true,
      },
    ]);

    if (!useOperator) {
      state.operatorAddress = ensureHexPrefix(state.accountAddress);
      state.operatorAccountName = state.accountName;
      console.log("\nOperator will be the same as owner address.\n");
      return;
    }

    const accounts = this.listAccounts();
    const otherAccounts = accounts.filter(a => a.name !== state.accountName);

    const choices = [
      {name: "Create new operator account", value: "create"},
      ...(otherAccounts.length > 0 ? [{name: "Select from my accounts", value: "select"}] : []),
      {name: "Enter existing operator address", value: "existing"},
    ];

    const {operatorChoice} = await inquirer.prompt([
      {
        type: "list",
        name: "operatorChoice",
        message: "How would you like to set up the operator?",
        choices,
      },
    ]);

    if (operatorChoice === "existing") {
      const {operatorAddress} = await inquirer.prompt([
        {
          type: "input",
          name: "operatorAddress",
          message: "Enter operator address (0x...):",
          validate: (input: string) => {
            if (!input.match(/^0x[a-fA-F0-9]{40}$/)) {
              return "Invalid address format. Expected 0x followed by 40 hex characters.";
            }
            return true;
          },
        },
      ]);
      state.operatorAddress = ensureHexPrefix(operatorAddress);
      // No operatorAccountName - external address
      console.log("");
      return;
    }

    if (operatorChoice === "select") {
      const {selectedOperator} = await inquirer.prompt([
        {
          type: "list",
          name: "selectedOperator",
          message: "Select an account to use as operator:",
          choices: otherAccounts.map(a => ({
            name: `${a.name} (${a.address})`,
            value: a.name,
          })),
        },
      ]);

      const operatorKeystorePath = this.getKeystorePath(selectedOperator);
      const operatorData = JSON.parse(readFileSync(operatorKeystorePath, "utf-8"));
      state.operatorAddress = ensureHexPrefix(operatorData.address);
      state.operatorAccountName = selectedOperator;

      // Export the selected operator keystore
      const defaultFilename = `${selectedOperator}-keystore.json`;
      const {outputFilename} = await inquirer.prompt([
        {
          type: "input",
          name: "outputFilename",
          message: "Export keystore filename:",
          default: defaultFilename,
        },
      ]);

      let outputPath = path.resolve(`./${outputFilename}`);

      // Check if file exists and ask to overwrite
      if (existsSync(outputPath)) {
        const {overwrite} = await inquirer.prompt([
          {
            type: "confirm",
            name: "overwrite",
            message: `File ${outputFilename} already exists. Overwrite?`,
            default: false,
          },
        ]);
        if (!overwrite) {
          const {newFilename} = await inquirer.prompt([
            {
              type: "input",
              name: "newFilename",
              message: "Enter new filename:",
            },
          ]);
          outputPath = path.resolve(`./${newFilename}`);
        }
      }

      const {exportPassword} = await inquirer.prompt([
        {
          type: "password",
          name: "exportPassword",
          message: "Enter password for exported keystore (needed to import in node):",
          mask: "*",
          validate: (input: string) => input.length >= 8 || "Password must be at least 8 characters",
        },
      ]);

      const {confirmPassword} = await inquirer.prompt([
        {
          type: "password",
          name: "confirmPassword",
          message: "Confirm password:",
          mask: "*",
        },
      ]);

      if (exportPassword !== confirmPassword) {
        this.failSpinner("Passwords do not match");
      }

      const exportAction = new ExportAccountAction();
      await exportAction.execute({
        account: selectedOperator,
        output: outputPath,
        password: exportPassword,
        overwrite: true,
      });

      state.operatorKeystorePath = outputPath;

      console.log("\n========================================");
      console.log("  IMPORTANT: Transfer operator keystore");
      console.log("========================================");
      console.log(`File: ${outputPath}`);
      console.log("Transfer this file to your validator server and import it");
      console.log("into your validator node software.");
      console.log("========================================\n");
      return;
    }

    // Create new operator account
    const {operatorName} = await inquirer.prompt([
      {
        type: "input",
        name: "operatorName",
        message: "Enter a name for the operator account:",
        default: "operator",
        validate: (input: string) => {
          if (input.length === 0) return "Name cannot be empty";
          if (accounts.find(a => a.name === input)) return "Account with this name already exists";
          return true;
        },
      },
    ]);

    // Create the operator account
    console.log("");
    const createAction = new CreateAccountAction();
    await createAction.execute({name: operatorName, overwrite: false, setActive: false});

    // Get operator address
    const operatorKeystorePath = this.getKeystorePath(operatorName);
    const operatorData = JSON.parse(readFileSync(operatorKeystorePath, "utf-8"));
    state.operatorAddress = ensureHexPrefix(operatorData.address);
    state.operatorAccountName = operatorName;

    // Export keystore
    const defaultFilename = `${operatorName}-keystore.json`;
    const {outputFilename} = await inquirer.prompt([
      {
        type: "input",
        name: "outputFilename",
        message: "Export keystore filename:",
        default: defaultFilename,
      },
    ]);

    let outputPath = path.resolve(`./${outputFilename}`);

    // Check if file exists and ask to overwrite
    if (existsSync(outputPath)) {
      const {overwrite} = await inquirer.prompt([
        {
          type: "confirm",
          name: "overwrite",
          message: `File ${outputFilename} already exists. Overwrite?`,
          default: false,
        },
      ]);
      if (!overwrite) {
        const {newFilename} = await inquirer.prompt([
          {
            type: "input",
            name: "newFilename",
            message: "Enter new filename:",
          },
        ]);
        outputPath = path.resolve(`./${newFilename}`);
      }
    }

    const {exportPassword} = await inquirer.prompt([
      {
        type: "password",
        name: "exportPassword",
        message: "Enter password for exported keystore (needed to import in node):",
        mask: "*",
        validate: (input: string) => input.length >= 8 || "Password must be at least 8 characters",
      },
    ]);

    const {confirmPassword} = await inquirer.prompt([
      {
        type: "password",
        name: "confirmPassword",
        message: "Confirm password:",
        mask: "*",
      },
    ]);

    if (exportPassword !== confirmPassword) {
      this.failSpinner("Passwords do not match");
    }

    const exportAction = new ExportAccountAction();
    await exportAction.execute({
      account: operatorName,
      output: outputPath,
      password: exportPassword,
      overwrite: true,
    });

    state.operatorKeystorePath = outputPath;

    console.log("\n========================================");
    console.log("  IMPORTANT: Transfer operator keystore");
    console.log("========================================");
    console.log(`File: ${outputPath}`);
    console.log("Transfer this file to your validator server and import it");
    console.log("into your validator node software.");
    console.log("========================================\n");
  }

  private async stepStakeAmount(state: Partial<WizardState>): Promise<void> {
    console.log("Step 5: Stake Amount");
    console.log("--------------------\n");

    const balanceGEN = formatEther(state.balance!);
    const minStakeGEN = formatEther(state.minStake!);
    const hasMinStake = state.minStake! > 0n;

    const {stakeAmount} = await inquirer.prompt([
      {
        type: "input",
        name: "stakeAmount",
        message: hasMinStake
          ? `Enter stake amount (min: ${minStakeGEN}, max: ${balanceGEN} GEN):`
          : `Enter stake amount (max: ${balanceGEN} GEN):`,
        default: hasMinStake ? minStakeGEN : "1",
        validate: (input: string) => {
          const cleaned = input.toLowerCase().replace("gen", "").trim();
          const num = parseFloat(cleaned);
          if (isNaN(num) || num <= 0) {
            return "Please enter a valid positive number";
          }
          const amountWei = BigInt(Math.floor(num * 1e18));
          if (hasMinStake && amountWei < state.minStake!) {
            return `Amount must be at least ${minStakeGEN} GEN`;
          }
          if (amountWei > state.balance!) {
            return `Amount exceeds balance (${balanceGEN} GEN)`;
          }
          return true;
        },
      },
    ]);

    // Normalize amount to always have "gen" suffix
    const normalizedAmount = stakeAmount.toLowerCase().endsWith("gen") ? stakeAmount : `${stakeAmount}gen`;
    state.stakeAmount = normalizedAmount;

    const {confirm} = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `You will stake ${stakeAmount}. Continue?`,
        default: true,
      },
    ]);

    if (!confirm) {
      throw new Error("WIZARD_ABORTED");
    }

    console.log("");
  }

  private async stepJoinValidator(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 6: Join as Validator");
    console.log("-------------------------\n");

    this.startSpinner("Creating validator...");

    try {
      const client = await this.getStakingClient({
        ...options,
        account: state.accountName,
        network: state.networkAlias,
      });

      const amount = this.parseAmount(state.stakeAmount!);

      this.setSpinnerText(`Creating validator with ${this.formatAmount(amount)} stake...`);

      const result = await client.validatorJoin({
        amount,
        operator: state.operatorAddress as Address,
      });

      // Save the validator wallet address
      state.validatorWalletAddress = ensureHexPrefix(result.validatorWallet);

      this.succeedSpinner("Validator created successfully!", {
        transactionHash: result.transactionHash,
        validatorWallet: state.validatorWalletAddress,
        amount: result.amount,
        operator: result.operator,
        blockNumber: result.blockNumber.toString(),
      });

      console.log("");
    } catch (error: any) {
      this.failSpinner("Failed to create validator", error.message || error);
    }
  }

  private async stepIdentitySetup(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 7: Identity Setup");
    console.log("----------------------\n");

    const {setupIdentity} = await inquirer.prompt([
      {
        type: "confirm",
        name: "setupIdentity",
        message: "Would you like to set up your validator identity now?",
        default: true,
      },
    ]);

    if (!setupIdentity) {
      console.log("\nYou can set up identity later with: genlayer staking set-identity\n");
      return;
    }

    // Collect all identity fields
    const {moniker} = await inquirer.prompt([
      {
        type: "input",
        name: "moniker",
        message: "Enter validator display name (moniker):",
        validate: (input: string) => input.length > 0 || "Moniker is required",
      },
    ]);

    const {logoUri} = await inquirer.prompt([
      {
        type: "input",
        name: "logoUri",
        message: "Enter logo URL (optional):",
      },
    ]);

    const {website} = await inquirer.prompt([
      {
        type: "input",
        name: "website",
        message: "Enter website URL (optional):",
      },
    ]);

    const {description} = await inquirer.prompt([
      {
        type: "input",
        name: "description",
        message: "Enter description (optional):",
      },
    ]);

    const {email} = await inquirer.prompt([
      {
        type: "input",
        name: "email",
        message: "Enter contact email (optional):",
      },
    ]);

    const {twitter} = await inquirer.prompt([
      {
        type: "input",
        name: "twitter",
        message: "Enter Twitter handle (optional):",
      },
    ]);

    const {telegram} = await inquirer.prompt([
      {
        type: "input",
        name: "telegram",
        message: "Enter Telegram handle (optional):",
      },
    ]);

    const {github} = await inquirer.prompt([
      {
        type: "input",
        name: "github",
        message: "Enter GitHub handle (optional):",
      },
    ]);

    state.identity = {
      moniker,
      logoUri: logoUri || undefined,
      website: website || undefined,
      description: description || undefined,
      email: email || undefined,
      twitter: twitter || undefined,
      telegram: telegram || undefined,
      github: github || undefined,
    };

    this.startSpinner("Setting validator identity...");

    try {
      const client = await this.getStakingClient({
        ...options,
        account: state.accountName,
        network: state.networkAlias,
      });

      // Use the validator wallet address (contract), not owner address
      const validatorAddress = state.validatorWalletAddress || state.accountAddress;

      await client.setIdentity({
        validator: ensureHexPrefix(validatorAddress) as Address,
        moniker,
        logoUri: logoUri || undefined,
        website: website || undefined,
        description: description || undefined,
        email: email || undefined,
        twitter: twitter || undefined,
        telegram: telegram || undefined,
        github: github || undefined,
      });

      this.succeedSpinner("Validator identity set!");
      console.log("");
    } catch (error: any) {
      this.stopSpinner();
      this.logWarning(`Failed to set identity: ${error.message || error}`);
      console.log("You can try again later with: genlayer staking set-identity\n");
    }
  }

  private showSummary(state: WizardState): void {
    console.log("\n========================================");
    console.log("   Validator Setup Complete!");
    console.log("========================================\n");

    // Ensure all addresses have 0x prefix
    const validatorWallet = ensureHexPrefix(state.validatorWalletAddress || state.accountAddress);
    const ownerAddress = ensureHexPrefix(state.accountAddress);
    const operatorAddress = ensureHexPrefix(state.operatorAddress || "");

    console.log("Summary:");
    // Validator wallet address first - most important
    console.log(`  Validator Wallet:  ${validatorWallet}`);
    console.log(`  Owner:             ${ownerAddress} (${state.accountName})`);

    // Operator - show account name if it's a CLI account
    if (state.operatorAccountName) {
      console.log(`  Operator:          ${operatorAddress} (${state.operatorAccountName})`);
    } else {
      console.log(`  Operator:          ${operatorAddress}`);
    }

    console.log(`  Staked Amount:     ${state.stakeAmount}`);
    console.log(`  Network:           ${BUILT_IN_NETWORKS[state.networkAlias].name}`);

    if (state.identity) {
      console.log(`  Identity:`);
      console.log(`    Moniker: ${state.identity.moniker}`);
      if (state.identity.logoUri) console.log(`    Logo: ${state.identity.logoUri}`);
      if (state.identity.website) console.log(`    Website: ${state.identity.website}`);
      if (state.identity.description) console.log(`    Description: ${state.identity.description}`);
      if (state.identity.email) console.log(`    Email: ${state.identity.email}`);
      if (state.identity.twitter) console.log(`    Twitter: ${state.identity.twitter}`);
      if (state.identity.telegram) console.log(`    Telegram: ${state.identity.telegram}`);
      if (state.identity.github) console.log(`    GitHub: ${state.identity.github}`);
    }

    console.log("\nNext Steps:");
    let step = 1;
    if (state.operatorKeystorePath) {
      console.log(`  ${step++}. Transfer operator keystore to your validator server:`);
      console.log(`     ${state.operatorKeystorePath}`);
      console.log(`  ${step++}. Import it into your validator node software`);
    }
    console.log(`  ${step++}. Monitor your validator:`);
    console.log(`     genlayer staking validator-info --validator ${validatorWallet}`);
    console.log(`  ${step++}. Lock your account when done: genlayer account lock`);
    console.log("\n========================================\n");
  }
}
