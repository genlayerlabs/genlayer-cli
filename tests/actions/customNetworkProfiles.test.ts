import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {tmpdir} from "os";
import {NetworkActions} from "../../src/commands/network/setNetwork";
import {resolveNetwork} from "../../src/lib/actions/BaseAction";
import {parseDeploymentObject} from "../../src/lib/networks/customNetworks";
import {testnetBradbury} from "genlayer-js/chains";
import {StakingAction} from "../../src/commands/staking/StakingAction";

const ADDR_1 = "0x1111111111111111111111111111111111111111";
const ADDR_2 = "0x2222222222222222222222222222222222222222";
const ADDR_3 = "0x3333333333333333333333333333333333333333";
const ADDR_4 = "0x4444444444444444444444444444444444444444";
const ADDR_5 = "0x5555555555555555555555555555555555555555";
const ADDR_6 = "0x6666666666666666666666666666666666666666";
const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("custom network profiles", () => {
  let tempHome: string;
  let action: NetworkActions;
  let succeedSpy: any;
  let failSpy: any;
  let warningSpy: any;
  let infoSpy: any;
  let consoleSpy: any;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(tmpdir(), "genlayer-custom-network-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);
    action = new NetworkActions();
    succeedSpy = vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    failSpy = vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    warningSpy = vi.spyOn(action as any, "logWarning").mockImplementation(() => {});
    infoSpy = vi.spyOn(action as any, "logInfo").mockImplementation(() => {});
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempHome, {recursive: true, force: true});
  });

  test("network add stores flags-only overrides", async () => {
    await action.addNetwork("bradbury-clarke", {
      base: "testnet-bradbury",
      rpc: "http://localhost:9999",
      consensusMain: ADDR_1,
      chainId: "4222",
    });

    expect(failSpy).not.toHaveBeenCalled();
    expect(readConfig().customNetworks["bradbury-clarke"]).toEqual({
      base: "testnet-bradbury",
      overrides: {
        consensusMain: ADDR_1,
        rpcUrl: "http://localhost:9999",
        chainId: 4222,
      },
    });
    expect(succeedSpy).toHaveBeenCalledWith(
      "Custom network profile added",
      expect.objectContaining({
        alias: "bradbury-clarke",
        base: "testnet-bradbury",
        consensusMain: `${ADDR_1} (overridden)`,
        rpc: "http://localhost:9999 (overridden)",
      }),
    );
  });

  test("network add stores and applies an --explorer override", async () => {
    await action.addNetwork("bradbury-explorer", {
      base: "testnet-bradbury",
      rpc: "http://localhost:9999",
      explorer: "https://explorer.custom.example/",
    });

    expect(failSpy).not.toHaveBeenCalled();
    expect(readConfig().customNetworks["bradbury-explorer"].overrides.explorer).toBe(
      "https://explorer.custom.example/",
    );
    const chain = resolveNetwork("bradbury-explorer", readConfig().customNetworks);
    expect(chain.blockExplorers?.default?.url).toBe("https://explorer.custom.example/");
  });

  test("custom network does NOT inherit the base block explorer when --explorer is omitted", async () => {
    // Guard the premise: the base chain does carry an explorer.
    expect(testnetBradbury.blockExplorers?.default?.url).toBeTruthy();

    await action.addNetwork("bradbury-no-explorer", {
      base: "testnet-bradbury",
      rpc: "http://localhost:9999",
    });

    expect(failSpy).not.toHaveBeenCalled();
    const chain = resolveNetwork("bradbury-no-explorer", readConfig().customNetworks);
    // The misleading base explorer must NOT be inherited.
    expect(chain.blockExplorers).toBeUndefined();
  });

  test("network add rejects an invalid --explorer URL", async () => {
    await action.addNetwork("bradbury-bad-explorer", {
      base: "testnet-bradbury",
      explorer: "explorer.custom.example",
    });

    expect(failSpy).toHaveBeenCalledWith(
      "Failed to add custom network profile",
      expect.stringContaining("Invalid --explorer URL"),
    );
  });

  test("network add sources overrides from a deployment file", async () => {
    const deploymentPath = writeDeployment({
      genlayerTestnet: {
        deployment_x: {
          ConsensusMain: ADDR_1,
          ConsensusData: ADDR_2,
          GenStaking: ADDR_3,
          FeeManager: ADDR_4,
          Rounds: ADDR_5,
          Appeals: ADDR_6,
        },
      },
    });

    await action.addNetwork("bradbury-deployment", {
      base: "testnet-bradbury",
      deployment: deploymentPath,
    });

    expect(failSpy).not.toHaveBeenCalled();
    expect(readConfig().customNetworks["bradbury-deployment"].overrides).toEqual({
      consensusMain: ADDR_1,
      consensusData: ADDR_2,
      staking: ADDR_3,
      feeManager: ADDR_4,
      roundsStorage: ADDR_5,
      appeals: ADDR_6,
    });
  });

  test("network add gives address flags precedence over deployment file", async () => {
    const deploymentPath = writeDeployment({
      deployment_x: {
        ConsensusMain: ADDR_1,
        ConsensusData: ADDR_2,
      },
    });

    await action.addNetwork("bradbury-precedence", {
      base: "testnet-bradbury",
      deployment: deploymentPath,
      consensusMain: ADDR_A,
    });

    expect(failSpy).not.toHaveBeenCalled();
    expect(readConfig().customNetworks["bradbury-precedence"].overrides).toEqual({
      consensusMain: ADDR_A,
      consensusData: ADDR_2,
    });
  });

  test("network add validates base, alias, addresses, and override presence", async () => {
    await action.addNetwork("localnet", {base: "testnet-bradbury", rpc: "http://localhost:9999"});
    await action.addNetwork("bad-base", {base: "missing", rpc: "http://localhost:9999"});
    await action.addNetwork("bad-address", {base: "testnet-bradbury", consensusMain: "0x123"});
    await action.addNetwork("empty", {base: "testnet-bradbury"});

    expect(failSpy).toHaveBeenNthCalledWith(
      1,
      "Failed to add custom network profile",
      "Custom network alias cannot collide with built-in network: localnet",
    );
    expect(failSpy).toHaveBeenNthCalledWith(
      2,
      "Failed to add custom network profile",
      "Base network must be one of: localnet, studionet, testnet-asimov, testnet-bradbury",
    );
    expect(failSpy).toHaveBeenNthCalledWith(
      3,
      "Failed to add custom network profile",
      "Invalid address for --consensus-main: 0x123",
    );
    expect(failSpy).toHaveBeenNthCalledWith(
      4,
      "Failed to add custom network profile",
      "Provide at least one override: --deployment, --rpc, --chain-id, --explorer, or a contract address flag",
    );
  });

  test("network add rejects ambiguous deployment contract names", async () => {
    const deploymentPath = writeDeployment({
      net_a: {deployment: {ConsensusMain: ADDR_1}},
      net_b: {deployment: {ConsensusMain: ADDR_2}},
    });

    await action.addNetwork("ambiguous", {
      base: "testnet-bradbury",
      deployment: deploymentPath,
    });

    expect(failSpy).toHaveBeenCalledWith(
      "Failed to add custom network profile",
      expect.stringContaining("Pass --deployment-key <dot.path>"),
    );
  });

  test("network add supports --deployment-key", async () => {
    const deploymentPath = writeDeployment({
      net_a: {deployment: {ConsensusMain: ADDR_1}},
      net_b: {deployment: {ConsensusMain: ADDR_2}},
    });

    await action.addNetwork("keyed", {
      base: "testnet-bradbury",
      deployment: deploymentPath,
      deploymentKey: "net_b.deployment",
    });

    expect(failSpy).not.toHaveBeenCalled();
    expect(readConfig().customNetworks.keyed.overrides).toEqual({
      consensusMain: ADDR_2,
    });
  });

  test("network set, list, info, and remove handle custom profiles", async () => {
    await action.addNetwork("bradbury-clarke", {
      base: "testnet-bradbury",
      rpc: "http://localhost:9999",
      consensusMain: ADDR_1,
    });
    succeedSpy.mockClear();

    await action.setNetwork("bradbury-clarke");
    expect(readConfig().network).toBe("bradbury-clarke");
    expect(succeedSpy).toHaveBeenCalledWith("Network successfully set to bradbury-clarke (custom)");

    await action.listNetworks();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("bradbury-clarke"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("custom   base: testnet-bradbury"));

    succeedSpy.mockClear();
    await action.showInfo();
    expect(succeedSpy).toHaveBeenCalledWith(
      "Current network",
      expect.objectContaining({
        alias: "bradbury-clarke",
        type: "custom",
        base: "testnet-bradbury",
        rpc: "http://localhost:9999 (overridden)",
        consensusMain: `${ADDR_1} (overridden)`,
        consensusData: expect.stringContaining("(inherited)"),
      }),
    );

    await action.removeNetwork("bradbury-clarke");
    expect(warningSpy).toHaveBeenCalledWith("Removed active network bradbury-clarke; active network reset to localnet.");
    expect(readConfig().network).toBe("localnet");
    expect(readConfig().customNetworks["bradbury-clarke"]).toBeUndefined();
  });

  test("network remove refuses built-ins", async () => {
    await action.removeNetwork("localnet");

    expect(failSpy).toHaveBeenCalledWith(
      "Failed to remove custom network profile",
      "Cannot remove built-in network: localnet",
    );
  });

  test("deployment parser notices ConsensusMainWithFees when ConsensusMain is present", () => {
    const parsed = parseDeploymentObject({
      deployment: {
        ConsensusMain: ADDR_1,
        ConsensusMainWithFees: ADDR_2,
      },
    });

    expect(parsed.overrides.consensusMain).toBe(ADDR_1);
    expect(parsed.notices[0]).toContain("ConsensusMainWithFees exists");
  });

  test("resolveNetwork applies custom overrides while retaining base ABI objects", () => {
    const resolved = resolveNetwork("bradbury-clarke", {
      "bradbury-clarke": {
        base: "testnet-bradbury",
        overrides: {
          consensusMain: ADDR_1,
          rpcUrl: "http://localhost:9999",
          chainId: 4222,
        },
      },
    });

    const resolvedChain = resolved as any;
    const baseChain = testnetBradbury as any;
    expect(resolved).not.toBe(testnetBradbury);
    expect(resolvedChain.id).toBe(4222);
    expect(resolvedChain.rpcUrls.default.http[0]).toBe("http://localhost:9999");
    expect(resolvedChain.consensusMainContract.address).toBe(ADDR_1);
    expect(resolvedChain.consensusMainContract.abi).toBe(baseChain.consensusMainContract.abi);
    expect(resolvedChain.consensusDataContract.abi).toBe(baseChain.consensusDataContract.abi);
    // Display name is the alias the user chose, not the base chain's name.
    expect(resolvedChain.name).toBe("bradbury-clarke");
    expect(resolvedChain.name).not.toBe(baseChain.name);
  });

  test("StakingAction.getNetwork accepts a custom alias", () => {
    const stakingAction = new StakingAction();
    (vi.spyOn(stakingAction as any, "getConfigByKey") as any).mockImplementation((key: string) => {
      if (key === "customNetworks") {
        return {
          "bradbury-clarke": {
            base: "testnet-bradbury",
            overrides: {
              staking: ADDR_3,
            },
          },
        };
      }
      return null;
    });

    const network = (stakingAction as any).getNetwork({network: "bradbury-clarke"});

    expect(network.stakingContract.address).toBe(ADDR_3);
    expect(network.stakingContract.abi).toBe((testnetBradbury as any).stakingContract.abi);
  });

  function writeDeployment(content: unknown): string {
    const deploymentPath = path.join(tempHome, "deployment.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(content, null, 2));
    return deploymentPath;
  }

  function readConfig(): Record<string, any> {
    return JSON.parse(fs.readFileSync(path.join(tempHome, ".genlayer", "genlayer-config.json"), "utf-8"));
  }
});
