import type {Address, GenLayerChain, GenLayerClient} from "genlayer-js/types";

// LOCKSTEP(genlayer-js#feat/vesting-actions): local CLI-facing type shim until
// genlayer-js#v2-dev publishes VestingActions and VestingState.
export interface VestingTransactionResult {
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  gasUsed: bigint;
}

export interface VestingDelegatorJoinResult extends VestingTransactionResult {
  vesting: Address;
  validator: Address;
  beneficiary: Address;
  amount: string;
  amountRaw: bigint;
}

export interface VestingWithdrawResult extends VestingTransactionResult {
  vesting: Address;
  beneficiary: Address;
  amount: string;
  amountRaw: bigint;
}

export interface VestingValidatorJoinResult extends VestingTransactionResult {
  vesting?: Address;
  validatorWallet?: Address;
  wallet?: Address;
  operator?: Address;
  beneficiary?: Address;
  amount?: string;
  amountRaw?: bigint;
}

export interface VestingFactoryLookupOptions {
  factory?: Address;
  addressManager?: Address;
}

export interface VestingState {
  name: string;
  category: number;
  beneficiary: Address;
  creator: Address;
  revoker: Address;
  factory: Address;
  addressManager: Address;
  totalAmount: string;
  totalAmountRaw: bigint;
  startDate: bigint;
  cliffDuration: bigint;
  periodDuration: bigint;
  numberOfPeriods: bigint;
  cliffUnlockBps: bigint;
  needsManualUnlock: boolean;
  manualUnlocked: boolean;
  revoked: boolean;
  vestingStopped: boolean;
  totalWithdrawn: string;
  totalWithdrawnRaw: bigint;
  vestedAtRevocation: string;
  vestedAtRevocationRaw: bigint;
  totalAmountAtRevocation: string;
  totalAmountAtRevocationRaw: bigint;
  revokedAt: bigint;
  vestingStoppedAt: bigint;
  vestedAtStop: string;
  vestedAtStopRaw: bigint;
  postRevocationBeneficiaryRewards: string;
  postRevocationBeneficiaryRewardsRaw: bigint;
  postRevocationBeneficiaryLosses: string;
  postRevocationBeneficiaryLossesRaw: bigint;
  accumulatedRewards: string;
  accumulatedRewardsRaw: bigint;
  accumulatedLosses: string;
  accumulatedLossesRaw: bigint;
  vestedAmount: string;
  vestedAmountRaw: bigint;
  unvestedAmount: string;
  unvestedAmountRaw: bigint;
  withdrawableAmount: string;
  withdrawableAmountRaw: bigint;
}

export type VestingClient = GenLayerClient<GenLayerChain> & {
  getBeneficiaryVestings: (beneficiary: Address, options?: VestingFactoryLookupOptions) => Promise<Address[]>;
  getVestingState: (vesting: Address) => Promise<VestingState>;
  vestingDelegatorJoin: (options: {
    vesting: Address;
    validator: Address;
    amount: bigint | string;
  }) => Promise<VestingDelegatorJoinResult>;
  vestingDelegatorExit: (options: {
    vesting: Address;
    validator: Address;
    shares: bigint | string;
  }) => Promise<VestingTransactionResult>;
  vestingDelegatorClaim: (options: {
    vesting: Address;
    validator: Address;
  }) => Promise<VestingTransactionResult>;
  vestingWithdraw: (options: {
    vesting: Address;
    amount: bigint | string;
  }) => Promise<VestingWithdrawResult>;
  vestingValidatorJoin: (options: {
    vesting: Address;
    operator: Address;
    amount: bigint | string;
  }) => Promise<VestingValidatorJoinResult>;
  vestingValidatorDeposit: (options: {
    vesting: Address;
    wallet: Address;
    amount: bigint | string;
  }) => Promise<VestingTransactionResult>;
  vestingValidatorExit: (options: {
    vesting: Address;
    wallet: Address;
    shares: bigint | string;
  }) => Promise<VestingTransactionResult>;
  vestingValidatorClaim: (options: {
    vesting: Address;
    wallet: Address;
  }) => Promise<VestingTransactionResult>;
  vestingValidatorInitiateOperatorTransfer: (options: {
    vesting: Address;
    wallet: Address;
    newOperator: Address;
  }) => Promise<VestingTransactionResult>;
  vestingValidatorCompleteOperatorTransfer: (options: {
    vesting: Address;
    wallet: Address;
  }) => Promise<VestingTransactionResult>;
  vestingValidatorCancelOperatorTransfer: (options: {
    vesting: Address;
    wallet: Address;
  }) => Promise<VestingTransactionResult>;
  vestingValidatorSetIdentity: (options: {
    vesting: Address;
    wallet: Address;
    moniker: string;
    logoUri: string;
    website: string;
    description: string;
    email: string;
    twitter: string;
    telegram: string;
    github: string;
    extraCid: `0x${string}`;
  }) => Promise<VestingTransactionResult>;
  getValidatorWallets: (vesting: Address) => Promise<Address[]>;
  validatorWalletCount: (vesting: Address) => Promise<bigint>;
  validatorDeposited: (vesting: Address, wallet: Address) => Promise<bigint | string>;
  isValidatorWallet: (vesting: Address, wallet: Address) => Promise<boolean>;
};
