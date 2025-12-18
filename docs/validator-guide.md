# Validator Guide

This guide walks you through becoming a validator on the GenLayer testnet using the CLI.

For a deeper understanding of how staking works in GenLayer, see the [Staking documentation](/understand-genlayer-protocol/core-concepts/optimistic-democracy/staking).

## Prerequisites

- Node.js installed
- GenLayer CLI installed (`npm install -g genlayer`)
- GEN tokens for staking (minimum stake required)

## Quick Start: Validator Wizard

The easiest way to become a validator is using the interactive wizard:

```bash
genlayer staking wizard
```

The wizard guides you through all steps:
1. Account setup (create or select)
2. Network selection
3. Balance verification
4. Operator setup (optional, recommended for security)
5. Stake amount selection
6. Validator creation
7. Identity setup (moniker, website, etc.)

If you prefer manual setup, follow the steps below.

---

## Manual Setup

## Step 1: Create an Owner Account

```bash
genlayer account create --name owner
```

You'll be prompted to set a password. This creates an encrypted keystore file in standard web3 format.

The owner account holds your staked funds and controls the validator. Keep it secure.

## Step 2: View Your Account

```bash
genlayer account show
```

Output:
```
{
  name: 'owner',
  address: '0x86D0d159483CBf01E920ECfF8bB7F0Cd7E964E7E',
  balance: '0 GEN',
  network: 'localnet',
  status: 'locked',
  active: true
}
```

## Step 3: Set Network to Testnet

```bash
genlayer network testnet-asimov
```

Verify with:
```bash
genlayer account show
```

You should see `network: 'Asimov Testnet'`.

## Step 4: Fund Your Account

Transfer GEN tokens to your address:
- Use the faucet (if available)
- Transfer from another funded account using `genlayer account send`

## Step 5: Check Staking Requirements

```bash
genlayer staking epoch-info
```

Output:
```
✔ Epoch info

  Current Epoch: 5 (started 9h 30m ago)
  Next Epoch:    in 14h 30m
  Validators:    33
  Weight:        6061746783417938774454
  Slashed:       0 GEN

  Previous Epoch: 4 (finalized)
  Inflation:      1732904.66 GEN
  Claimed:        0 GEN
  Unclaimed:      1732904.66 GEN
  Slashed:        0 GEN

  Min Epoch Duration:   24h 0m
  Validator Min Stake:  42000 GEN
  Delegator Min Stake:  42 GEN
```

You can also query a specific epoch:
```bash
genlayer staking epoch-info --epoch 4
```

Note the `validatorMinStake` - you need at least this amount.

## Step 6: Unlock Your Account (Optional)

For convenience, unlock your account to avoid entering password repeatedly:

```bash
genlayer account unlock
```

This caches your private key in the OS keychain.

## Step 7: Join as Validator

```bash
genlayer staking validator-join --amount 42000gen --operator 0xOperator...
```

Options:
- `--amount <amount>` - Stake amount (e.g., `42000gen` or `42000`)
- `--operator <address>` - Operator address (recommended, see below)

### Why Use an Operator Address?

**Recommended:** Use a separate operator address for security.

- **Validator wallet** - Holds your staked funds (keep offline/cold)
- **Operator wallet** - Signs blocks and performs validator duties (hot wallet on server)

This way, if your operator server is compromised, your staked funds remain safe.

If you already have an operator wallet (e.g., from geth, foundry, or another tool), you can use its address directly. Otherwise, create one:

```bash
# Create operator account (skip if you already have one)
genlayer account create --name operator

# View operator address
genlayer account show --account operator
# Address: 0xOperator123...

# Export keystore for validator node software (standard web3 format)
genlayer account export --account operator --output ./operator-keystore.json

# Join as validator with separate operator
genlayer staking validator-join --amount 42000gen --operator 0xOperator123...
```

Transfer `operator-keystore.json` to your validator server and import it into your validator node software. The keystore is in standard web3 format, compatible with geth, foundry, and other Ethereum tools.

You can change the operator later:

```bash
genlayer staking set-operator --validator 0xYourValidator... --operator 0xNewOperator...
```

## Step 8: Verify Your Validator Status

```bash
genlayer staking validator-info
```

Output:
```
{
  validator: '0x86D0d159483CBf01E920ECfF8bB7F0Cd7E964E7E',
  vStake: '42000 GEN',
  vShares: '42000000000000000000000',
  live: true,
  banned: 'Not banned',
  ...
}
```

## Step 9: Set Validator Identity (Metadata)

Set your validator's public identity so delegators can find you:

```bash
genlayer staking set-identity \
  --validator 0x86D0...7E \
  --moniker "My Validator" \
  --website "https://myvalidator.com" \
  --description "Reliable validator with 99.9% uptime" \
  --twitter "myvalidator" \
  --github "myvalidator"
```

**Required:**
- `--validator <address>` - Your validator address
- `--moniker <name>` - Display name for your validator

**Optional:**
- `--logo-uri <uri>` - Logo image URL
- `--website <url>` - Website URL
- `--description <text>` - Description of your validator
- `--email <email>` - Contact email
- `--twitter <handle>` - Twitter handle
- `--telegram <handle>` - Telegram handle
- `--github <handle>` - GitHub handle
- `--extra-cid <cid>` - Additional data as IPFS CID

Your identity will show in `validator-info`:

```bash
genlayer staking validator-info
```

Output will include:
```
{
  ...
  identity: {
    moniker: 'My Validator',
    website: 'https://myvalidator.com',
    twitter: 'myvalidator',
    github: 'myvalidator'
  }
}
```

## Managing Your Validator

### Priming Your Validator

Validators must be "primed" each epoch to participate in consensus. Priming updates the validator's stake record for the upcoming epoch.

```bash
# Prime your validator
genlayer staking validator-prime 0xYourValidator...

# Or prime all validators at once (anyone can do this)
genlayer staking prime-all
```

The `validators` command shows priming status:
- **Green** `e11` - Primed for current epoch
- **Yellow** `e10` - Needs priming before next epoch
- **Red** `e9!` - Urgently needs priming (behind)

### Add More Stake

```bash
genlayer staking validator-deposit --validator 0xYourValidatorWallet... --amount 1000gen
```

### Check Active Validators

```bash
genlayer staking active-validators
```

### View Validator Set

```bash
# Show all validators with stake, primed status, and weight
genlayer staking validators

# Include banned validators
genlayer staking validators --all
```

### Exit as Validator

```bash
genlayer staking validator-exit --validator 0xYourValidatorWallet... --shares 100
```

This initiates a withdrawal. Your tokens enter an **unbonding period of 7 epochs** before they can be claimed.

Check your pending withdrawals with `validator-info`:
```
selfStakePendingWithdrawals: [
  {
    epoch: '5',
    shares: '100',
    stake: '100 GEN',
    claimableAtEpoch: '12',
    status: 'Unbonding (4 epochs remaining)'
  }
]
```

### Claim Withdrawals

After the 7-epoch unbonding period:

```bash
genlayer staking validator-claim --validator 0xYourValidatorWallet...
```

## Troubleshooting

### "No account found"
Run `genlayer account create` first.

### "Insufficient balance"
Ensure you have enough GEN. Check with `genlayer account show`.

### "Below minimum stake"
Check minimum with `genlayer staking epoch-info` and increase your stake amount.

### Transaction Stuck
Check the transaction status:
```bash
genlayer receipt <tx-hash>
```

## Lock Your Account

When done, lock your account to remove the cached private key:

```bash
genlayer account lock
```
