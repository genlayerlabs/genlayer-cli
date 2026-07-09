import {StakingAction, StakingConfig, BUILT_IN_NETWORKS, type BrowserWalletSession} from "./StakingAction";
import {resolveNetwork} from "../../lib/actions/BaseAction";
import {CreateAccountAction} from "../account/create";
import {ExportAccountAction} from "../account/export";
import inquirer from "inquirer";
import type {Address} from "genlayer-js/types";
import {formatEther, parseEther} from "viem";
import {createClient, abi} from "genlayer-js";
import {readFileSync, existsSync} from "fs";
import path from "path";
import {buildValidatorJoinTx, buildSetIdentityTx, extractValidatorWallet} from "../../lib/wallet/stakingTx";
import {buildTx} from "../../lib/wallet/txBuilders";
import type {VestingClient, VestingValidatorJoinResult} from "../vesting/vestingTypes";
import {vestingAvailableToStake} from "../../lib/vesting/availableToStake";

const BROWSER_WALLET_CHOICE = "__browser_wallet__";

export interface WizardOptions extends StakingConfig {
  skipIdentity?: boolean;
  /** Run end-to-end with zero prompts; every choice must come from a flag. */
  nonInteractive?: boolean;
  /** Alias for --non-interactive (also doubles as "assume yes" to confirmations). */
  yes?: boolean;
  /** Funding source: "wallet" (default) or "vesting". */
  fundingSource?: string;
  /** Vesting contract address to fund from (when fundingSource === "vesting"). */
  vestingContract?: string;
  /** External operator address (0x...). */
  operator?: string;
  /** Name of a new operator account to create (exported keystore). */
  createOperator?: string;
  /** Reuse the owner address as the operator. */
  operatorSame?: boolean;
  /** Password for the exported operator keystore (required with --create-operator). */
  operatorPassword?: string;
  /** Output filename for the exported operator keystore. */
  operatorKeystoreOut?: string;
  /** Self-stake amount (GEN number, e.g. "42" or "42gen"). */
  amount?: string;
  // Identity fields (mirror `staking set-identity`).
  moniker?: string;
  logoUri?: string;
  website?: string;
  description?: string;
  email?: string;
  twitter?: string;
  telegram?: string;
  github?: string;
}

interface WizardState {
  accountName: string;
  accountAddress: string;
  networkAlias: string;
  /** Where the self-stake comes from. "wallet" (default) keeps the original flow. */
  stakeSource: "wallet" | "vesting";
  /** Chosen vesting contract address when stakeSource === "vesting". */
  vestingContract?: string;
  balance: bigint;
  minStake: bigint;
  operatorAddress?: string;
  operatorAccountName?: string; // if operator is a CLI account
  operatorKeystorePath?: string;
  stakeAmount: string;
  validatorWalletAddress?: string; // the validator contract address returned from validatorJoin
  ownerIsBrowserWallet?: boolean;
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
  /** Non-interactive mode: no prompts, every choice comes from a flag. */
  private ni = false;

  constructor() {
    super();
  }

  /** True when the wizard must run with zero prompts (--non-interactive / --yes). */
  private isNonInteractive(options: WizardOptions): boolean {
    return Boolean(options.nonInteractive || options.yes);
  }

  /** Fail with a clear "you forgot flag X" message for non-interactive mode. */
  private missingFlag(flag: string, why?: string): never {
    throw new Error(
      `Non-interactive mode requires ${flag}${why ? ` (${why})` : ""}. ` +
        `Pass it, or drop --non-interactive/--yes to be prompted.`,
    );
  }

  async execute(options: WizardOptions): Promise<void> {
    console.log("\n========================================");
    console.log("   GenLayer Validator Setup Wizard");
    console.log("========================================\n");

    this.ni = this.isNonInteractive(options);

    // Validate flag combinations up-front (throws on --account/--password + browser).
    this.assertBrowserWalletFlags(options, "wizard");

    const state: Partial<WizardState> = {};

    try {
      // Step 1: Account Setup
      await this.stepAccountSetup(state, options);

      // Step 2: Network Selection
      await this.stepNetworkSelection(state, options);

      // Step 2b: Funding source (wallet vs vesting contract). Default "wallet"
      // keeps the original flow untouched.
      await this.stepStakeSource(state, options);

      // Step 3: Balance Check (lazily starts the browser session if owner is browser wallet)
      await this.stepBalanceCheck(state, options);

      // Step 4: Operator Setup
      await this.stepOperatorSetup(state, options);

      // Step 5: Stake Amount
      await this.stepStakeAmount(state, options);

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
    } finally {
      const session = this._wizardSession;
      this._wizardSession = null;
      this.browserSession = null;
      // session.close() is a no-op for a remote (daemon) session and a full
      // close for an own bridge — so a shared daemon survives the wizard.
      if (session) await session.close();
    }
  }

  /**
   * Lazily start the browser-wallet bridge for the owner. Deferred until after
   * network selection (step 2) so the connect prompt carries the right chain.
   * Idempotent — reuses the same page session across steps 3/6/7.
   */
  private async ensureBrowserSession(
    state: Partial<WizardState>,
    options: WizardOptions,
  ): Promise<BrowserWalletSession> {
    if (this._wizardSession) return this._wizardSession;

    // getBrowserWalletSession sets this.browserSession (base field) internally.
    this._wizardSession = await this.getBrowserWalletSession(
      {...options, network: state.networkAlias},
      "wizard",
    );
    state.accountAddress = this._wizardSession.signerAddress;
    if (!state.accountName) state.accountName = "browser wallet";
    return this._wizardSession;
  }

  /** Staking-scoped session cache (carries stakingAddress on top of the base session). */
  private _wizardSession: BrowserWalletSession | null = null;

  private async stepAccountSetup(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 1: Account Setup");
    console.log("---------------------\n");

    // Browser-wallet owner. Auto-selected when the effective wallet mode is
    // browser: explicit --wallet browser, walletMode=browser config, OR a live
    // wallet session (connect-once) — consistent with every other command. The
    // actual bridge start is deferred until after network selection (step 2) so
    // the connect prompt carries the right chain; here we only record the choice.
    if (this.resolveWalletMode(options.wallet) === "browser") {
      state.ownerIsBrowserWallet = true;
      state.accountName = "browser wallet";
      console.log("Owner account: browser wallet (MetaMask) — the cold key stays in your wallet.");
      console.log("You will connect and sign in your browser after selecting the network.\n");
      return;
    }

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

    // Non-interactive: the owner must be resolvable from flags. Browser and
    // --account both returned above, so reaching here means neither was given.
    if (this.ni) {
      this.missingFlag("--account", "to select the owner keystore, or --wallet browser");
    }

    const accounts = this.listAccounts();

    if (accounts.length === 0) {
      // No accounts exist, create one
      console.log("No accounts found. Let's create one.\n");
      const {accountName} = await inquirer.prompt([
        {
          type: "input",
          name: "accountName",
          message: "Enter a name for your owner account:",
          default: "owner",
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
        {
          name: "Connect browser wallet (MetaMask) — cold key stays in your wallet",
          value: BROWSER_WALLET_CHOICE,
        },
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

      if (selectedAccount === BROWSER_WALLET_CHOICE) {
        state.ownerIsBrowserWallet = true;
        state.accountName = "browser wallet";
        console.log("\nOwner account: browser wallet (MetaMask).");
        console.log("You will connect and sign in your browser after selecting the network.");
      } else if (selectedAccount === "__create_new__") {
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
      const network = resolveNetwork(options.network, this.getCustomNetworks());
      state.networkAlias = options.network;
      this.writeConfig("network", options.network);
      console.log(`Using network: ${network.name}\n`);
      return;
    }

    if (this.ni) {
      this.missingFlag("--network");
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

    // Also offer any custom networks the user configured (`genlayer network add`).
    const customNetworks = this.getCustomNetworks();
    const customChoices = Object.entries(customNetworks).map(([alias, profile]) => ({
      name: `${resolveNetwork(alias, customNetworks).name} (custom, base: ${profile.base})`,
      value: alias,
    }));

    const {selectedNetwork} = await inquirer.prompt([
      {
        type: "list",
        name: "selectedNetwork",
        message: "Select network:",
        choices: [...networks, ...customChoices],
        default: currentNetwork || "testnet-asimov",
      },
    ]);

    state.networkAlias = selectedNetwork;
    this.writeConfig("network", selectedNetwork);
    // Resolve through both built-in and custom maps so a custom alias doesn't crash.
    console.log(`\nNetwork set to: ${resolveNetwork(selectedNetwork, this.getCustomNetworks()).name}\n`);
  }

  /**
   * Account-less (read-only) client typed for the vesting lookups the wizard
   * needs (getBeneficiaryVestings / getVestingState / getValidatorWallets). The
   * genlayer-js client exposes the vesting actions at runtime; the cast bridges
   * the CLI-facing type shim (same pattern as VestingAction.getReadOnlyVestingClient).
   */
  private getWizardVestingReadClient(state: Partial<WizardState>, options: WizardOptions): VestingClient {
    const network = resolveNetwork(state.networkAlias!, this.getCustomNetworks());
    return createClient({
      chain: network,
      account: state.accountAddress as Address,
      endpoint: options.rpc,
    }) as unknown as VestingClient;
  }

  /**
   * Choose where the self-stake is funded from: the owner's wallet (default,
   * original flow) or one of the owner's vesting contracts. When vesting is
   * chosen we resolve the concrete contract up-front (none → loop back with a
   * clear message; one → use it; many → pick), so the balance/join steps have a
   * concrete `state.vestingContract` to work with.
   */
  private async stepStakeSource(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step: Funding Source");
    console.log("--------------------\n");

    if (this.ni) {
      return this.stepStakeSourceNonInteractive(state, options);
    }

    // Loop so a "no vesting contracts" answer can bounce the user straight back
    // to the source choice instead of crashing or dead-ending.
    for (;;) {
      const {stakeSource} = await inquirer.prompt([
        {
          type: "list",
          name: "stakeSource",
          message: "Fund this validator from:",
          choices: [
            {name: "Your wallet", value: "wallet"},
            {name: "A vesting contract", value: "vesting"},
          ],
          default: "wallet",
        },
      ]);

      if (stakeSource === "wallet") {
        state.stakeSource = "wallet";
        console.log("");
        return;
      }

      // Vesting: the beneficiary is the owner. For a browser owner not yet
      // connected, start the shared session now (network is already selected) so
      // we can read the connected address — the same session the join reuses.
      let beneficiary = state.accountAddress;
      if (!beneficiary && state.ownerIsBrowserWallet) {
        console.log("Connect your browser wallet to continue...");
        const session = await this.ensureBrowserSession(state, options);
        beneficiary = session.signerAddress;
      }

      this.startSpinner("Looking up vesting contracts...");
      let vestings: Address[] = [];
      try {
        const readClient = this.getWizardVestingReadClient(state, options);
        vestings = await readClient.getBeneficiaryVestings(beneficiary as Address);
      } catch (error: any) {
        this.stopSpinner();
        this.logWarning(`Could not look up vesting contracts: ${error.message || error}`);
        continue;
      }
      this.stopSpinner();

      if (!vestings || vestings.length === 0) {
        this.logWarning(
          `No vesting contracts found for ${beneficiary}. ` +
            `Choose 'Your wallet' or fund a vesting contract first.`,
        );
        continue;
      }

      if (vestings.length === 1) {
        state.vestingContract = ensureHexPrefix(vestings[0]);
      } else {
        const {selectedVesting} = await inquirer.prompt([
          {
            type: "list",
            name: "selectedVesting",
            message: "Select the vesting contract to fund from:",
            choices: vestings.map(v => ({name: v, value: v})),
          },
        ]);
        state.vestingContract = ensureHexPrefix(selectedVesting);
      }

      state.stakeSource = "vesting";
      console.log(`\nFunding from vesting contract: ${state.vestingContract}\n`);
      return;
    }
  }

  /**
   * Non-interactive funding source. Defaults to "wallet" (the original flow) when
   * --funding-source is omitted. For "vesting" the concrete contract is taken from
   * --vesting-contract, or auto-resolved when the owner has exactly one; zero or
   * many (without --vesting-contract) is a hard error naming the flag to pass.
   */
  private async stepStakeSourceNonInteractive(
    state: Partial<WizardState>,
    options: WizardOptions,
  ): Promise<void> {
    const source = options.fundingSource ?? "wallet";
    if (source !== "wallet" && source !== "vesting") {
      throw new Error(`Invalid --funding-source '${source}'. Use 'wallet' or 'vesting'.`);
    }

    if (source === "wallet") {
      state.stakeSource = "wallet";
      console.log("Funding source: your wallet\n");
      return;
    }

    // Vesting: the beneficiary is the owner. For a browser owner not yet
    // connected, start the shared session now so we can read the address.
    let beneficiary = state.accountAddress;
    if (!beneficiary && state.ownerIsBrowserWallet) {
      const session = await this.ensureBrowserSession(state, options);
      beneficiary = session.signerAddress;
    }

    if (options.vestingContract) {
      state.vestingContract = ensureHexPrefix(options.vestingContract);
    } else {
      this.startSpinner("Looking up vesting contracts...");
      let vestings: Address[] = [];
      try {
        const readClient = this.getWizardVestingReadClient(state, options);
        vestings = await readClient.getBeneficiaryVestings(beneficiary as Address);
      } catch (error: any) {
        this.stopSpinner();
        throw new Error(`Could not look up vesting contracts: ${error.message || error}`);
      }
      this.stopSpinner();

      if (!vestings || vestings.length === 0) {
        throw new Error(
          `No vesting contracts found for ${beneficiary}. ` +
            `Fund a vesting contract first, or use --funding-source wallet.`,
        );
      }
      if (vestings.length > 1) {
        this.missingFlag(
          "--vesting-contract",
          `${vestings.length} vesting contracts found for ${beneficiary}; pick one`,
        );
      }
      state.vestingContract = ensureHexPrefix(vestings[0]);
    }

    state.stakeSource = "vesting";
    console.log(`Funding from vesting contract: ${state.vestingContract}\n`);
  }

  private async stepBalanceCheck(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 3: Balance Check");
    console.log("---------------------\n");

    // For a browser-wallet owner, start the bridge now (network is known) and
    // obtain the owner address from the wallet connect handshake. The session may
    // already be up if a vesting source was chosen in the funding step.
    if (state.ownerIsBrowserWallet) {
      if (!this._wizardSession) console.log("Connect your browser wallet to continue...");
      const session = await this.ensureBrowserSession(state, options);
      state.accountAddress = session.signerAddress;
      console.log(`Connected owner: ${session.signerAddress}\n`);
    }

    // A vesting-funded validator checks the vesting contract's balance, not the
    // wallet's (gas is still paid from the wallet — see the sanity check inside).
    if (state.stakeSource === "vesting") {
      return this.stepBalanceCheckVesting(state, options);
    }

    this.startSpinner("Checking balance and staking requirements...");

    const network = resolveNetwork(state.networkAlias!, this.getCustomNetworks());
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
          `Fund your account (${state.accountAddress}) and run the wizard again.`,
      );
    }

    state.balance = balance;
    state.minStake = currentEpoch === 0n ? 0n : minStakeRaw;

    console.log("Balance sufficient!\n");
  }

  /**
   * Balance check for a vesting-funded validator. The stake is committed from
   * the vesting contract, so we validate the contract's available-to-stake
   * against the minimum. "Available" is the contract's LIVE ON-CHAIN BALANCE
   * (0 once revoked): Vesting.sol enforces staking against address(this).balance
   * — reverting InsufficientContractBalance when the amount exceeds it — so the
   * balance is the true cap (shared with `genlayer balances`). It already
   * includes still-locked (unvested) tokens, which vesting-backed staking may
   * commit (they return to the contract on exit). Gas is still paid from the
   * wallet, so we keep a non-blocking low-wallet-balance warning.
   */
  private async stepBalanceCheckVesting(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    this.startSpinner("Checking vesting balance and staking requirements...");

    const network = resolveNetwork(state.networkAlias!, this.getCustomNetworks());
    const walletClient = createClient({
      chain: network,
      account: state.accountAddress as Address,
      endpoint: options.rpc,
    });
    const vestingClient = this.getWizardVestingReadClient(state, options);

    const [walletBalance, epochInfo, vestingState] = await Promise.all([
      walletClient.getBalance({address: state.accountAddress as Address}),
      walletClient.getEpochInfo(),
      vestingClient.getVestingState(state.vestingContract as Address),
    ]);

    this.stopSpinner();

    const minStakeRaw = epochInfo.validatorMinStakeRaw;
    const minStakeFormatted = epochInfo.validatorMinStake;
    const currentEpoch = epochInfo.currentEpoch;

    // A revoked contract can never stake again (Vesting.sol blocks every stake
    // path once revoked), so its available-to-stake is 0 regardless of balance.
    // Bail out cleanly — like the no-contracts path — rather than presenting a
    // 0 cap the user can't act on.
    if (vestingState.revoked) {
      this.logError(
        `This vesting contract has been revoked; it can no longer stake.\n` +
          `Re-run the wizard and choose 'Your wallet'.`,
      );
      throw new Error("WIZARD_ABORTED");
    }

    // Authoritative cap: the vesting contract's live native balance (not
    // total − withdrawn), shared with `genlayer balances`.
    const available = await vestingAvailableToStake(
      vestingClient,
      state.vestingContract as Address,
      vestingState.revoked,
    );

    console.log(`Vesting contract: ${state.vestingContract}`);
    console.log(`Available to stake: ${this.formatAmount(available)}`);
    console.log(`Minimum stake required: ${minStakeFormatted}`);
    if (currentEpoch === 0n) {
      console.log("(Epoch 0: minimum stake not enforced)");
      console.log(`Note: Validator won't become active until self-stake reaches ${minStakeFormatted}`);
    }

    const minRequired = currentEpoch === 0n ? 0n : minStakeRaw;
    if (available < minRequired) {
      console.log("");
      this.failSpinner(
        `Insufficient vesting balance. The vesting contract has ${this.formatAmount(available)} available, ` +
          `but at least ${minStakeFormatted} is required to become a validator.\n` +
          `Fund the vesting contract or re-run the wizard and choose 'Your wallet'.`,
      );
    }

    // Gas for the create tx is paid from the wallet, not the vesting contract.
    const MIN_GAS_BUFFER = parseEther("0.01");
    if (walletBalance < MIN_GAS_BUFFER) {
      this.logWarning(
        `Your wallet balance (${formatEther(walletBalance)} GEN) is low. Gas for the create ` +
          `transaction is paid from your wallet (${state.accountAddress}), not the vesting contract.`,
      );
    }

    // stepStakeAmount reuses state.balance as the max and state.minStake as the floor.
    state.balance = available;
    state.minStake = currentEpoch === 0n ? 0n : minStakeRaw;

    console.log("Vesting balance sufficient!\n");
  }

  private async stepOperatorSetup(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 4: Operator Setup");
    console.log("----------------------\n");

    if (this.ni) {
      return this.stepOperatorSetupNonInteractive(state, options);
    }

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

  /**
   * Non-interactive operator setup. Exactly one of the operator flags must be
   * given: --operator-same (reuse owner), --operator <addr> (external), or
   * --create-operator <name> (mint + export a new keystore, needs
   * --operator-password). Anything else is a hard error naming the choices.
   */
  private async stepOperatorSetupNonInteractive(
    state: Partial<WizardState>,
    options: WizardOptions,
  ): Promise<void> {
    if (options.operatorSame) {
      state.operatorAddress = ensureHexPrefix(state.accountAddress!);
      state.operatorAccountName = state.accountName;
      console.log("Operator will be the same as owner address.\n");
      return;
    }

    if (options.operator) {
      if (!options.operator.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error(
          `Invalid --operator '${options.operator}'. Expected 0x followed by 40 hex characters.`,
        );
      }
      state.operatorAddress = ensureHexPrefix(options.operator);
      console.log(`Operator: ${state.operatorAddress}\n`);
      return;
    }

    if (options.createOperator) {
      const operatorName = options.createOperator;
      if (this.listAccounts().find(a => a.name === operatorName)) {
        throw new Error(`Account '${operatorName}' already exists. Choose another --create-operator name.`);
      }
      if (!options.operatorPassword) {
        this.missingFlag("--operator-password", "to encrypt the exported operator keystore");
      }
      if (options.operatorPassword.length < 8) {
        throw new Error("--operator-password must be at least 8 characters.");
      }

      const createAction = new CreateAccountAction();
      await createAction.execute({name: operatorName, overwrite: false, setActive: false});

      const operatorKeystorePath = this.getKeystorePath(operatorName);
      const operatorData = JSON.parse(readFileSync(operatorKeystorePath, "utf-8"));
      state.operatorAddress = ensureHexPrefix(operatorData.address);
      state.operatorAccountName = operatorName;

      const outputFilename = options.operatorKeystoreOut || `${operatorName}-keystore.json`;
      const outputPath = path.resolve(`./${outputFilename}`);

      const exportAction = new ExportAccountAction();
      await exportAction.execute({
        account: operatorName,
        output: outputPath,
        password: options.operatorPassword,
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

    this.missingFlag(
      "an operator choice",
      "one of --operator-same, --operator <addr>, or --create-operator <name>",
    );
  }

  private async stepStakeAmount(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 5: Stake Amount");
    console.log("--------------------\n");

    const balanceGEN = formatEther(state.balance!);
    const minStakeGEN = formatEther(state.minStake!);
    const hasMinStake = state.minStake! > 0n;

    if (this.ni) {
      if (!options.amount) {
        this.missingFlag("--amount");
      }
      const cleaned = options.amount.toLowerCase().replace("gen", "").trim();
      const num = parseFloat(cleaned);
      if (isNaN(num) || num <= 0) {
        throw new Error(`Invalid --amount '${options.amount}'. Enter a positive GEN amount.`);
      }
      const amountWei = BigInt(Math.floor(num * 1e18));
      if (hasMinStake && amountWei < state.minStake!) {
        throw new Error(`--amount is below the minimum stake of ${minStakeGEN} GEN.`);
      }
      if (amountWei > state.balance!) {
        throw new Error(`--amount exceeds the available balance (${balanceGEN} GEN).`);
      }
      state.stakeAmount = options.amount.toLowerCase().endsWith("gen") ? options.amount : `${options.amount}gen`;
      console.log(`Staking ${state.stakeAmount}\n`);
      return;
    }

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

    // Vesting-funded: build+send the vesting validator-create tx (funds come from
    // the vesting contract, not the wallet). Operator is still required + passed.
    if (state.stakeSource === "vesting") {
      if (state.ownerIsBrowserWallet) {
        return this.stepJoinValidatorVestingBrowser(state, options);
      }
      return this.stepJoinValidatorVestingKeystore(state, options);
    }

    if (state.ownerIsBrowserWallet) {
      return this.stepJoinValidatorBrowser(state, options);
    }

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

  private async stepJoinValidatorBrowser(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    const session = await this.ensureBrowserSession(state, options);
    const amount = this.parseAmount(state.stakeAmount!);

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const {to, data} = buildValidatorJoinTx(session.stakingAddress, state.operatorAddress);
      const receipt = await session.sendTransaction({
        to,
        data,
        value: amount,
        label: `Join as validator (${this.formatAmount(amount)})`,
      });

      const validatorWallet = extractValidatorWallet(receipt);
      state.validatorWalletAddress = ensureHexPrefix(validatorWallet);

      this.succeedSpinner("Validator created successfully!", {
        transactionHash: receipt.transactionHash,
        validatorWallet: state.validatorWalletAddress,
        amount: this.formatAmount(amount),
        operator: state.operatorAddress,
        blockNumber: receipt.blockNumber.toString(),
      });

      console.log("");
    } catch (error: any) {
      // Abort the wizard on a failed/rejected join (nothing downstream can proceed).
      this.failSpinner("Failed to create validator", error.message || error);
      throw new Error("WIZARD_ABORTED");
    }
  }

  /**
   * Keystore owner + vesting source: create the validator via the vesting client's
   * vestingValidatorJoin (mirrors `vesting validator create`). The genlayer-js
   * client the keystore path builds exposes the vesting actions at runtime; the
   * cast bridges the CLI-facing type shim.
   */
  private async stepJoinValidatorVestingKeystore(
    state: Partial<WizardState>,
    options: WizardOptions,
  ): Promise<void> {
    this.startSpinner("Creating vesting-backed validator...");

    try {
      const client = (await this.getStakingClient({
        ...options,
        account: state.accountName,
        network: state.networkAlias,
      })) as unknown as VestingClient;

      const amount = this.parseAmount(state.stakeAmount!);
      const vesting = state.vestingContract as Address;

      this.setSpinnerText(`Creating validator with ${this.formatAmount(amount)} from vesting ${vesting}...`);

      // Pin the CLI-facing result shape: the SDK's GenLayerClient typing omits the
      // optional validatorWallet/wallet fields, so read them off the local shim.
      const result: VestingValidatorJoinResult = await client.vestingValidatorJoin({
        vesting,
        operator: state.operatorAddress as Address,
        amount,
      });

      // The join receipt does not carry the wallet address; the vesting contract
      // tracks its wallets, so the newest entry is the one just created.
      let validatorWallet = result.validatorWallet || result.wallet;
      if (!validatorWallet) {
        try {
          const wallets = await client.getValidatorWallets(vesting);
          validatorWallet = wallets[wallets.length - 1];
        } catch {
          // Leave undefined; the summary falls back to the owner address.
        }
      }
      if (validatorWallet) state.validatorWalletAddress = ensureHexPrefix(validatorWallet);

      this.succeedSpinner("Vesting-backed validator created successfully!", {
        transactionHash: result.transactionHash,
        vesting,
        validatorWallet: state.validatorWalletAddress,
        amount: result.amount || this.formatAmount(amount),
        operator: result.operator || state.operatorAddress,
        blockNumber: result.blockNumber.toString(),
      });

      console.log("");
    } catch (error: any) {
      this.failSpinner("Failed to create vesting-backed validator", error.message || error);
    }
  }

  /**
   * Browser owner + vesting source: send the vestingValidatorJoin tx through the
   * shared browser session (reusing the same tx-builder as `vesting validator
   * create --wallet browser`). Funds come from the vesting contract, so there is
   * no msg.value on this tx.
   */
  private async stepJoinValidatorVestingBrowser(
    state: Partial<WizardState>,
    options: WizardOptions,
  ): Promise<void> {
    const session = await this.ensureBrowserSession(state, options);
    const amount = this.parseAmount(state.stakeAmount!);
    const vesting = state.vestingContract as Address;

    this.startSpinner("Confirm the transaction in your browser wallet...");

    try {
      const {to, data} = buildTx(abi.VESTING_ABI as any, vesting, "vestingValidatorJoin", [
        state.operatorAddress,
        amount,
      ]);

      const receipt = await session.sendTransaction({
        to,
        data,
        label: `Create vesting validator (${this.formatAmount(amount)})`,
      });

      // The join receipt does not carry the wallet address; read the newest entry
      // the vesting contract tracks.
      let validatorWallet: Address | undefined;
      try {
        const readClient = this.getWizardVestingReadClient(state, options);
        const wallets = await readClient.getValidatorWallets(vesting);
        validatorWallet = wallets[wallets.length - 1];
      } catch {
        // Leave undefined; the summary falls back to the owner address.
      }
      if (validatorWallet) state.validatorWalletAddress = ensureHexPrefix(validatorWallet);

      this.succeedSpinner("Vesting-backed validator created successfully!", {
        transactionHash: receipt.transactionHash,
        vesting,
        validatorWallet: state.validatorWalletAddress,
        amount: this.formatAmount(amount),
        operator: state.operatorAddress,
        blockNumber: receipt.blockNumber.toString(),
      });

      console.log("");
    } catch (error: any) {
      // Abort the wizard on a failed/rejected join (nothing downstream can proceed).
      this.failSpinner("Failed to create vesting-backed validator", error.message || error);
      throw new Error("WIZARD_ABORTED");
    }
  }

  /**
   * How the user can set identity later — differs by funding source. A
   * vesting-backed validator's identity is set through the vesting contract
   * (`vesting validator set-identity`), a wallet-backed one through staking.
   */
  private identitySetLaterHint(state: Partial<WizardState>): string {
    if (state.stakeSource === "vesting") {
      const walletHint = state.validatorWalletAddress || "<validator-wallet>";
      return `genlayer vesting validator set-identity ${walletHint} --vesting ${state.vestingContract}`;
    }
    return "genlayer staking set-identity";
  }

  private async stepIdentitySetup(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    console.log("Step 7: Identity Setup");
    console.log("----------------------\n");

    // Both funding sources run the same guided identity step: identical prompts
    // and fields. Only the commit target differs — a vesting-backed validator's
    // identity is set through the vesting contract (see commitIdentity).

    if (this.ni) {
      // Identity is optional non-interactively: driven by --moniker. No moniker
      // means "skip identity" (same as the interactive "no" answer).
      if (!options.moniker) {
        console.log("\nNo --moniker given; skipping identity setup.");
        console.log(`You can set it later with: ${this.identitySetLaterHint(state)}\n`);
        return;
      }
      state.identity = {
        moniker: options.moniker,
        logoUri: options.logoUri || undefined,
        website: options.website || undefined,
        description: options.description || undefined,
        email: options.email || undefined,
        twitter: options.twitter || undefined,
        telegram: options.telegram || undefined,
        github: options.github || undefined,
      };
      await this.commitIdentity(state, options);
      return;
    }

    const {setupIdentity} = await inquirer.prompt([
      {
        type: "confirm",
        name: "setupIdentity",
        message: "Would you like to set up your validator identity now?",
        default: true,
      },
    ]);

    if (!setupIdentity) {
      console.log(`\nYou can set up identity later with: ${this.identitySetLaterHint(state)}\n`);
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

    await this.commitIdentity(state, options);
  }

  /**
   * Send the set-identity transaction from `state.identity`. Routing:
   *  - vesting funding → the vesting contract's vestingValidatorSetIdentity
   *    (keystore via the SDK client, browser via the shared bridge);
   *  - wallet funding → staking's setIdentity (keystore) / buildSetIdentityTx
   *    (browser), unchanged.
   * Shared by the interactive and non-interactive identity steps so both behave
   * identically. A revert (e.g. consensus gaps) is caught: the wizard warns and
   * continues to the summary rather than crashing or losing the created validator.
   */
  private async commitIdentity(state: Partial<WizardState>, options: WizardOptions): Promise<void> {
    const identity = state.identity!;

    // Use the validator wallet address (contract), not the owner address.
    const validatorAddress = ensureHexPrefix(state.validatorWalletAddress || state.accountAddress!);

    // Vesting identity must target the just-created vesting validator wallet. If
    // we never learned that address (owner ≠ wallet), don't send a doomed tx —
    // point the user at the standalone command instead.
    if (state.stakeSource === "vesting" && !state.validatorWalletAddress) {
      this.logWarning("Could not determine the vesting validator wallet address; skipping identity.");
      console.log(`You can set it later with: ${this.identitySetLaterHint(state)}\n`);
      return;
    }

    this.startSpinner("Setting validator identity...");

    try {
      if (state.stakeSource === "vesting") {
        await this.commitVestingIdentity(state, options, validatorAddress);
      } else if (state.ownerIsBrowserWallet) {
        const session = await this.ensureBrowserSession(state, options);
        this.setSpinnerText("Confirm the identity transaction in your browser wallet...");
        const {to, data} = buildSetIdentityTx(validatorAddress, {
          moniker: identity.moniker,
          logoUri: identity.logoUri,
          website: identity.website,
          description: identity.description,
          email: identity.email,
          twitter: identity.twitter,
          telegram: identity.telegram,
          github: identity.github,
        });
        await session.sendTransaction({to, data, label: `Set validator identity (${identity.moniker})`});
      } else {
        const client = await this.getStakingClient({
          ...options,
          account: state.accountName,
          network: state.networkAlias,
        });

        await client.setIdentity({
          validator: validatorAddress as Address,
          moniker: identity.moniker,
          logoUri: identity.logoUri,
          website: identity.website,
          description: identity.description,
          email: identity.email,
          twitter: identity.twitter,
          telegram: identity.telegram,
          github: identity.github,
        });
      }

      this.succeedSpinner("Validator identity set!");
      console.log("");
    } catch (error: any) {
      this.stopSpinner();
      this.logWarning(`Failed to set identity: ${error.message || error}`);
      console.log(`You can try again later with: ${this.identitySetLaterHint(state)}\n`);
    }
  }

  /**
   * Set the identity of a vesting-backed validator wallet through the vesting
   * contract. Keystore owner → the SDK's vestingValidatorSetIdentity (same method
   * `vesting validator set-identity` calls); browser owner → the same calldata
   * builder used by that command, sent through the shared wizard session. The
   * wizard has no extraCid field, so it is sent empty ("0x").
   */
  private async commitVestingIdentity(
    state: Partial<WizardState>,
    options: WizardOptions,
    validatorAddress: string,
  ): Promise<void> {
    const identity = state.identity!;
    const vesting = state.vestingContract as Address;

    if (state.ownerIsBrowserWallet) {
      const session = await this.ensureBrowserSession(state, options);
      this.setSpinnerText("Confirm the identity transaction in your browser wallet...");
      const {to, data} = buildTx(abi.VESTING_ABI as any, vesting, "vestingValidatorSetIdentity", [
        validatorAddress,
        identity.moniker,
        identity.logoUri || "",
        identity.website || "",
        identity.description || "",
        identity.email || "",
        identity.twitter || "",
        identity.telegram || "",
        identity.github || "",
        "0x",
      ]);
      await session.sendTransaction({to, data, label: `Set validator identity (${identity.moniker})`});
      return;
    }

    // The genlayer-js client the keystore path builds exposes the vesting actions
    // at runtime; the cast bridges the CLI-facing type shim (same pattern as the
    // vesting join step).
    const client = (await this.getStakingClient({
      ...options,
      account: state.accountName,
      network: state.networkAlias,
    })) as unknown as VestingClient;

    await client.vestingValidatorSetIdentity({
      vesting,
      wallet: validatorAddress as Address,
      moniker: identity.moniker,
      logoUri: identity.logoUri || "",
      website: identity.website || "",
      description: identity.description || "",
      email: identity.email || "",
      twitter: identity.twitter || "",
      telegram: identity.telegram || "",
      github: identity.github || "",
      extraCid: "0x",
    });
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

    if (state.stakeSource === "vesting") {
      console.log(`  Funding Source:    Vesting contract ${ensureHexPrefix(state.vestingContract || "")}`);
      console.log(`                     (staked funds return to the vesting contract on exit/claim)`);
    } else {
      console.log(`  Funding Source:    Your wallet (${ownerAddress})`);
    }

    // Operator - show account name if it's a CLI account
    if (state.operatorAccountName) {
      console.log(`  Operator:          ${operatorAddress} (${state.operatorAccountName})`);
    } else {
      console.log(`  Operator:          ${operatorAddress}`);
    }

    console.log(`  Staked Amount:     ${state.stakeAmount}`);
    console.log(`  Network:           ${resolveNetwork(state.networkAlias, this.getCustomNetworks()).name}`);

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
    if (!state.ownerIsBrowserWallet) {
      console.log(`  ${step++}. Lock your account when done: genlayer account lock`);
    }
    console.log("\n========================================\n");
  }
}
