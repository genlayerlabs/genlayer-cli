# Ledger signing: SDK audit and release validation

Physical-device validation is **pending**. Keep this PR in draft and do not ship
this signing path until a maintainer completes and records the checklist below.
Automated protocol tests and a no-device probe do not verify device displays,
firmware behavior, USB permissions on other hosts, or real signatures.

## Pinned versions and context audit

Reviewed the installed package source/source maps for:

| Package | Exact version |
| --- | --- |
| `@ledgerhq/device-management-kit` | `1.12.0` |
| `@ledgerhq/device-signer-kit-ethereum` | `1.18.3` |
| `@ledgerhq/device-transport-kit-node-hid` | `1.0.1` |
| `@ledgerhq/context-module` | `2.9.0` |
| `rxjs` | `7.8.2` |

These versions are explicit optional dependencies, including the signer's context
peer. This pins the direct signing packages for global npm installs, which do not
use this repository's lockfile. Transitive dependencies still follow their
publishers' manifests; this is not a claim that the entire dependency tree is pinned.

In Ethereum signer `api/SignerEthBuilder`, `build()` constructs a default
`ContextModuleBuilder` only when no custom module was supplied. The CLI always
supplies `offlineLedgerContext` through `withContextModule()`.

In context module `src/ContextModuleBuilder`, `removeDefaultLoaders()` only flips
`defaultLoaders`. `src/DefaultContextModule` separately creates field loaders,
typed-data loaders, the blind-signing reporter and the signing reporter. Merely
calling `removeDefaultLoaders()` does **not** disable every hosted request.

The default Ethereum signing path can make these requests (conditional on device
capabilities, transaction contents and context-loader eligibility):

| Source under context-module `src/modules/` | Default request and disclosed data |
| --- | --- |
| `ethereum/dynamic-network/data/HttpDynamicNetworkDataSource` | GET `https://global.api.prd.ledger.com/cal/v1/networks`, `chain_id` query |
| `ethereum/calldata/data/HttpCalldataDescriptorDataSource`, token/external-plugin/gated-signing loaders | CAL GET metadata endpoints (`dapps`, `tokens`, `gated_dapps`, depending on loader), chain ID and contract address; calldata descriptors request `descriptors_calldata` |
| NFT, proxy and trusted-name HTTP data sources | `https://nft.api.live.ledger.com` routes containing chain/address/selector; proxy delegate POST also includes calldata and device challenge |
| `multichain/transaction-check/loaders/EthereumTransactionCheckLoader` and `data/HttpTransactionCheckDataSource` | POST `https://global.api.prd.ledger.com/transaction-checks/v3/ethereum/scan/tx`, body `{tx: {from, raw}, chain: chainId}` when device checks are enabled and loader requirements are met |
| `multichain/pki/data/HttpPkiCertificateDataSource` | CAL GET `certificates` with device/public-key metadata |
| `multichain/reporter/data/HttpBlindSigningReporterDatasource` | POST `https://blind-signing.api.ledger.com/ingest/v1/blind-signing-events`, including chain ID, target address, signing method and device/app details |
| `multichain/sign-reporter/data/HttpSignReporterDatasource` | POST `https://blind-signing.api.ledger.com/ingest/v2/blind-signing-events`, including chain ID, target address, selector, signing method and device/app details |

The signer's `internal/app-binder/task/BuildBaseContexts` passes the transaction
subset to `getContexts()`, including raw transaction bytes when device checks are
enabled. `BuildSubcontextsTask` can request field context. After signing,
`BlindSigningDetectionTask` calls both `report()` and `signReport()`.

Our replacement returns no contexts, returns a local error for field/typed-data
metadata, and makes both report methods no-ops. It instantiates none of the hosted
loaders/reporters. A device may still offer a transaction-check opt-in prompt; that
prompt does not enable any remote checks in this CLI. GenLayer contract writes and
deployments require blind signing, with no decoded calldata or hosted risk checks.
The selected GenLayer RPC remains necessary for transaction preparation/broadcast.

Tests use the real pinned SDK's `BuildBaseContexts` and
`BlindSigningDetectionTask`, with network methods spied on and forbidden, for both
values of the device's transaction-check flag. Other tests exercise the SDK's real
`SendSignTransactionTask`, APDU command encoding and response parser with simulated
responses: both parities, legacy/EIP-2930/EIP-1559, chain IDs 4221/61127/61997/61999,
and 32 KiB deployment payloads. These are protocol tests, not physical-device tests.

## Physical-device checklist — not yet run

Record the CLI commit, OS/architecture, Node version, device model, firmware,
Ethereum app version and network/chain ID. Use a test-only wallet and test funds.
Do not record recovery phrases, private keys or PINs.

- [ ] Install the packed CLI with optional dependencies on the target OS. Verify
  native USB/HID loading and actionable permission failures.
- [ ] With no device connected, verify a roughly 15-second wait and readable
  error. Connect during the wait and verify discovery succeeds.
- [ ] Check locked device, closed/wrong app, rejected import, rejected signing,
  disconnected device and blind signing disabled. Verify errors are readable,
  no rejected transaction is broadcast, and reconnect/retry works.
- [ ] Import and confirm the address on the physical display. Check default and
  alternate derivation paths, plus wrong-device/passphrase rejection. Connect
  only one Ledger: discovery selects the first accessible device.
- [ ] Sign a small transfer and recover/compare the sender from the raw signed
  transaction. Record fee, amount, destination and chain display behavior.
- [ ] Sign contract writes and a large deployment with blind signing enabled.
  Record exactly what the device displays (including what it cannot decode),
  transaction size, chain ID, transaction type and confirmed receipt hash.
- [ ] Exercise the supported GenLayer chain IDs/transaction envelopes and both
  signature parities; verify recovered sender and receipt for each test case.
- [ ] Sign UTF-8 and raw personal messages; verify with viem recovery. Try rejection.
- [ ] Run staking/vesting owner operations with a separate software operator
  keystore. A Ledger selected as operator must give the explicit proof error.
- [ ] Observe network traffic during signing: no Ledger-hosted metadata/checks/
  telemetry requests, even if the device's transaction-check option is enabled.
- [ ] Confirm read-only/list commands work with the device disconnected.

Attach results to the PR before removing the draft/release gate. No physical
hardware was available in the implementation environment.

## Physical-device results record

Status: **not run — awaiting a maintainer with a physical Ledger**. The fields
below are a reporting template, not validation evidence. Keep the checklist
unchecked until the corresponding result is observed on the device.

Copy this record into the PR for each tested device/OS combination:

| Environment | Recorded value |
| --- | --- |
| Tester and date | Pending |
| Tested CLI commit and package version | Pending |
| OS, version and architecture | Pending |
| Node and npm versions | Pending |
| Ledger model and firmware version | Pending |
| Ethereum app version | Pending |
| Network alias, chain ID and transaction envelope | Pending |
| Derivation path and public signer address | Pending |

| Case | Result and device-screen observations | Public evidence |
| --- | --- | --- |
| Installation and USB/HID permissions | Not run | Pending |
| No device; connect during discovery | Not run | Pending |
| Locked/wrong app; rejection; disconnect/retry | Not run | Pending |
| Address confirmation; alternate path; wrong device/passphrase | Not run | Pending |
| Transfer | Not run | Receipt hash, chain ID, recovered sender |
| Contract write; blind signing disabled/enabled | Not run | Receipt hash, chain ID, recovered sender |
| Large deployment | Not run | Receipt hash, calldata size, envelope, chain ID, recovered sender |
| Both signature parities on supported chain IDs/envelopes | Not run | Per-case receipt hash and recovered sender |
| UTF-8/raw messages and rejection | Not run | Public test message and recovery result |
| Staking/vesting with separate software operator | Not run | Receipt hash, chain ID, operator address |
| Ledger selected as operator | Not run | Error text; confirmation no transaction was sent |
| Network traffic with device checks disabled/enabled | Not run | Sanitized capture showing no Ledger-hosted requests |
| Read-only commands with device disconnected | Not run | Command and observed result |

Do not attach secrets, private RPC credentials, recovery phrases or PINs. For
rejected requests, record how absence of a broadcast was checked; no receipt is
expected. Record failures as failures and retain the draft gate while they are
investigated. A maintainer should remove draft status only after the required
hardware evidence is recorded and reviewed. Passing automated tests alone does
not clear this gate.

## No-device host probe (2026-11-19)

A standalone probe using the real pinned DMK and Node HID transport was run on
this Linux/Nix host, Node 20.20.1, without a connected Ledger. After supplying the
installed libudev/libusb runtime libraries, it exhausted the 15-second discovery
window and printed `No accessible Ledger found within 15 seconds ... Cause: No
selected device`, then exited with status 0 from the probe's error handler. Total
wall time was about 20 seconds including module initialization on the busy host.
A prior run missing libusb preserved `libusb-1.0.so.0` in the displayed cause.

The probe exposed that DMK `CloseSessionsUseCase` closes sessions but does not
call Node HID `destroy()`. The CLI now explicitly destroys its transport as well
as closing sessions, so hotplug listeners do not keep a failed command alive.
No device signature or broadcast was requested. This is not physical-device
qualification and does not satisfy the release checklist above.
