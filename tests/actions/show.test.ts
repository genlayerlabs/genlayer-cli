import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {createClient} from "genlayer-js";
import {testnetBradbury} from "genlayer-js/chains";
import {ShowAccountAction} from "../../src/commands/account/show";

// Keep genlayer-js real except createClient (no network I/O in the balance query).
vi.mock("genlayer-js", async importOriginal => {
  const actual = await importOriginal<typeof import("genlayer-js")>();
  return {...actual, createClient: vi.fn()};
});

describe("ShowAccountAction network label", () => {
  let tempHome: string;
  let action: ShowAccountAction;
  let succeedSpy: any;
  let failSpy: any;

  const address = "0x1234567890123456789012345678901234567890";
  const keystoreJson = JSON.stringify({
    address,
    crypto: {
      cipher: "aes-128-ctr",
      ciphertext: "x",
      cipherparams: {iv: "x"},
      kdf: "scrypt",
      kdfparams: {},
      mac: "x",
    },
    version: 3,
  });
  const mockClient = {getBalance: vi.fn()};

  beforeEach(() => {
    vi.clearAllMocks();
    // Own hermetic home so real config/keystore reads stay isolated.
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "gl-cli-show-"));
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    mockClient.getBalance.mockResolvedValue(0n);
    vi.mocked(createClient).mockReturnValue(mockClient as any);

    action = new ShowAccountAction();
    fs.writeFileSync(action.getKeystorePath("default"), keystoreJson);

    succeedSpy = vi.spyOn(action as any, "succeedSpinner").mockImplementation(() => {});
    failSpy = vi.spyOn(action as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(action as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn((action as any).keychainManager, "isAccountUnlocked").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempHome, {recursive: true, force: true});
  });

  test("custom active network shows its alias and real chainId, not the base chain name", async () => {
    action.writeConfig("customNetworks", {
      myclarke: {base: "testnet-bradbury", overrides: {chainId: 4221, rpcUrl: "http://localhost:9999"}},
    });
    action.writeConfig("network", "myclarke");
    action.setActiveAccount("default");

    await action.execute({});

    expect(failSpy).not.toHaveBeenCalled();
    const result = succeedSpy.mock.calls[0][1];
    expect(result.network).toBe("myclarke");
    expect(result.chainId).toBe(4221);
    // The old bug printed chain.name, which for a custom net is its base's name.
    expect(result.network).not.toBe(testnetBradbury.name);
  });

  test("--network overrides the active config network for label, chainId and balance query", async () => {
    action.writeConfig("customNetworks", {
      myclarke: {base: "testnet-bradbury", overrides: {chainId: 4221}},
    });
    action.writeConfig("network", "localnet");
    action.setActiveAccount("default");

    await action.execute({network: "myclarke"});

    expect(failSpy).not.toHaveBeenCalled();
    const result = succeedSpy.mock.calls[0][1];
    expect(result.network).toBe("myclarke");
    expect(result.chainId).toBe(4221);
    // The balance query must use the override network, not the config one.
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({chain: expect.objectContaining({id: 4221})}),
    );
  });
});
