# Delegator Guide

This guide walks you through delegating GEN tokens to a validator on the GenLayer testnet.

## What is Delegation?

Delegation allows you to stake your GEN tokens with an existing validator without running validator infrastructure yourself. You earn staking rewards proportional to your stake.

## Prerequisites

- Node.js installed
- GenLayer CLI installed (`npm install -g genlayer`)
- GEN tokens for staking

## Step 1: Create an Account

```bash
genlayer account create
```

You'll be prompted to set a password. This creates an encrypted keystore file.

## Step 2: Set Network to Testnet

```bash
genlayer network testnet-asimov
```

## Step 3: Fund Your Account

Transfer GEN tokens to your address. Check your balance:

```bash
genlayer account
```

## Step 4: Check Minimum Delegation

```bash
genlayer staking epoch-info
```

Note the `delegatorMinStake` - you need at least this amount.

## Step 5: Find a Validator

List all active validators:

```bash
genlayer staking active-validators
```

Output:
```json
{
  count: 6,
  validators: [
    '0xa8f1BF1e5e709593b4468d7ac5DC315Ea3CAe130',
    '0xe9246A020cbb4fC6C46e60677981879c9219e8B9',
    ...
  ]
}
```

Get details about a specific validator:

```bash
genlayer staking validator-info --validator 0xa8f1BF1e5e709593b4468d7ac5DC315Ea3CAe130
```

Look for:
- `live: true` - Validator is active
- `banned: 'Not banned'` - Validator is in good standing
- `identity` - Validator's metadata (moniker, website, etc.)

## Step 6: Unlock Your Account (Optional)

For convenience:

```bash
genlayer account unlock
```

## Step 7: Delegate to a Validator

```bash
genlayer staking delegator-join --validator 0xa8f1...130 --amount 100gen
```

Options:
- `--validator <address>` - Validator address to delegate to (required)
- `--amount <amount>` - Amount to stake (e.g., `100gen`)

## Step 8: Verify Your Delegation

```bash
genlayer staking stake-info --validator 0xa8f1...130
```

Output:
```json
{
  delegator: '0x86D0d159483CBf01E920ECfF8bB7F0Cd7E964E7E',
  validator: '0xa8f1BF1e5e709593b4468d7ac5DC315Ea3CAe130',
  shares: '100000000000000000000',
  stake: '100 GEN',
  projectedReward: '0.2 GEN per epoch',
  pendingDeposits: 'None',
  pendingWithdrawals: 'None'
}
```

The `projectedReward` shows your estimated earnings per epoch based on current inflation and your stake weight.

## Managing Your Delegation

### Check Your Stake

```bash
genlayer staking stake-info --validator 0xa8f1...130
```

### Withdraw (Exit) Delegation

To withdraw your stake:

```bash
genlayer staking delegator-exit --validator 0xa8f1...130 --shares 50
```

Options:
- `--validator <address>` - Validator you delegated to
- `--shares <shares>` - Number of shares to withdraw

This initiates a withdrawal. Your tokens enter an **unbonding period of 7 epochs** before they can be claimed.

Check your pending withdrawals with `stake-info`:
```json
pendingWithdrawals: [
  {
    epoch: '5',
    shares: '50',
    stake: '50 GEN',
    claimableAtEpoch: '12',
    status: 'Unbonding (4 epochs remaining)'
  }
]
```

### Claim Withdrawals

After the 7-epoch unbonding period, claim your tokens:

```bash
genlayer staking delegator-claim --validator 0xa8f1...130
```

## Choosing a Validator

Consider these factors when choosing a validator:

1. **Uptime** - Validators with high uptime earn more rewards
2. **Reputation** - Check their identity metadata and community presence
3. **Stake** - Higher stake may indicate trust from the community
4. **Not banned/quarantined** - Avoid validators with issues

Check quarantined validators:
```bash
genlayer staking quarantined-validators
```

Check banned validators:
```bash
genlayer staking banned-validators
```

## Troubleshooting

### "No account found"
Run `genlayer account create` first.

### "Insufficient balance"
Ensure you have enough GEN. Check with `genlayer account`.

### "Below minimum stake"
Check minimum with `genlayer staking epoch-info` and increase your amount.

### "Validator not found"
Verify the validator address is correct and they are still active.

### Transaction Stuck
Check the transaction status:
```bash
genlayer receipt <tx-hash>
```

## Lock Your Account

When done, lock your account:

```bash
genlayer account lock
```
