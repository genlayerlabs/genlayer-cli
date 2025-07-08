import {describe, test, vi, beforeEach, afterEach, expect} from "vitest";
import fs from "fs";
import {createClient, createAccount} from "genlayer-js";
import {DeployAction, DeployOptions} from "../../src/commands/contracts/deploy";
import {buildSync} from "esbuild";
import {pathToFileURL} from "url";

vi.mock("fs");
vi.mock("genlayer-js");
vi.mock("esbuild", () => ({
  buildSync: vi.fn(),
}));

describe("DeployAction", () => {
  let deployer: DeployAction;
  const mockClient = {
    deployContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    initializeConsensusSmartContract: vi.fn(),
  };

  const mockPrivateKey = "mocked_private_key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue(mockClient as any);
    vi.mocked(createAccount).mockReturnValue({privateKey: mockPrivateKey} as any);
    deployer = new DeployAction();
    vi.spyOn(deployer as any, "getPrivateKey").mockResolvedValue(mockPrivateKey);
    vi.spyOn(deployer as any, "getConfig").mockReturnValue({});

    vi.spyOn(deployer as any, "startSpinner").mockImplementation(() => {});
    vi.spyOn(deployer as any, "succeedSpinner").mockImplementation(() => {});
    vi.spyOn(deployer as any, "failSpinner").mockImplementation(() => {});
    vi.spyOn(deployer as any, "setSpinnerText").mockImplementation(() => {});
    vi.spyOn(deployer as any, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("reads contract code successfully", () => {
    const contractPath = "/mocked/contract/path";
    const contractContent = "contract code";
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(contractContent);

    const result = deployer["readContractCode"](contractPath);

    expect(fs.existsSync).toHaveBeenCalledWith(contractPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(contractPath, "utf-8");
    expect(result).toBe(contractContent);
  });

  test("throws error if contract file is missing", () => {
    const contractPath = "/mocked/contract/path";
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => deployer["readContractCode"](contractPath)).toThrowError(
      `Contract file not found: ${contractPath}`,
    );
    expect(fs.existsSync).toHaveBeenCalledWith(contractPath);
  });

  test("deploys contract with args", async () => {
    const options: DeployOptions = {
      contract: "/mocked/contract/path",
      args: [1, 2, 3],
    };
    const contractContent = "contract code";

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(contractContent);
    vi.mocked(mockClient.deployContract).mockResolvedValue("mocked_tx_hash");
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      data: {contract_address: "0xdasdsadasdasdada"},
    });

    await deployer.deploy(options);

    expect(fs.readFileSync).toHaveBeenCalledWith(options.contract, "utf-8");
    expect(mockClient.deployContract).toHaveBeenCalledWith({
      code: contractContent,
      args: [1, 2, 3],
      leaderOnly: false,
    });
    expect(mockClient.deployContract).toHaveReturnedWith(Promise.resolve("mocked_tx_hash"));
  });

  test("throws error for missing contract", async () => {
    const options: DeployOptions = {};

    await deployer.deploy(options);

    expect(deployer["failSpinner"]).toHaveBeenCalledWith("No contract specified for deployment.");
    expect(mockClient.deployContract).not.toHaveBeenCalled();
  });

  test("handles deployment errors", async () => {
    const options: DeployOptions = {
      contract: "/mocked/contract/path",
      args: [1, 2, 3],
    };
    const contractContent = "contract code";

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(contractContent);
    vi.mocked(mockClient.deployContract).mockRejectedValue(new Error("Mocked deployment error"));

    await deployer.deploy(options);

    expect(deployer["failSpinner"]).toHaveBeenCalledWith("Error deploying contract", expect.any(Error));
    expect(mockClient.deployContract).toHaveBeenCalled();
  });

  test("handles empty contract code", async () => {
    const options: DeployOptions = {
      contract: "/mocked/contract/path",
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("");

    await deployer.deploy(options);

    expect(deployer["failSpinner"]).toHaveBeenCalledWith("Contract code is empty.");
    expect(mockClient.deployContract).not.toHaveBeenCalled();
  });

  test("deployScripts executes scripts in order", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["1_first.ts", "2_second.js", "10_last.ts"] as any);

    vi.spyOn(deployer as any, "executeTsScript").mockResolvedValue(undefined);
    vi.spyOn(deployer as any, "executeJsScript").mockResolvedValue(undefined);

    await deployer.deployScripts();

    expect(deployer["setSpinnerText"]).toHaveBeenCalledWith("Found 3 deploy scripts. Executing...");
    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(expect.stringMatching(/1_first.ts/), undefined);
    expect(deployer["executeJsScript"]).toHaveBeenCalledWith(
      expect.stringMatching(/2_second.js/),
      undefined,
      undefined,
    );
    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(expect.stringMatching(/10_last.ts/), undefined);
  });

  test("executeTsScript transpiles and executes TypeScript", async () => {
    const filePath = "/mocked/script.ts";
    const outFile = "/mocked/script.compiled.js";

    vi.spyOn(deployer as any, "executeJsScript").mockResolvedValue(undefined);
    vi.mocked(buildSync).mockImplementation((() => {}) as any);

    await deployer["executeTsScript"](filePath);

    expect(deployer["startSpinner"]).toHaveBeenCalledWith(`Transpiling TypeScript file: ${filePath}`);
    expect(buildSync).toHaveBeenCalledWith({
      entryPoints: [filePath],
      outfile: outFile,
      bundle: false,
      platform: "node",
      format: "esm",
      target: "es2020",
      sourcemap: false,
    });

    expect(deployer["executeJsScript"]).toHaveBeenCalledWith(filePath, outFile, undefined);
    expect(fs.unlinkSync).toHaveBeenCalledWith(outFile);
  });

  test("deployScripts fails when deploy folder is missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await deployer.deployScripts();

    expect(deployer["failSpinner"]).toHaveBeenCalledWith("No deploy folder found.");
  });

  test("deployScripts sorts and executes scripts correctly", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["10_last.ts", "2_second.js", "1_first.ts"] as any);

    vi.spyOn(deployer as any, "executeTsScript").mockResolvedValue(undefined);
    vi.spyOn(deployer as any, "executeJsScript").mockResolvedValue(undefined);

    await deployer.deployScripts();

    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(
      expect.stringContaining("1_first.ts"),
      undefined,
    );
    expect(deployer["executeJsScript"]).toHaveBeenCalledWith(
      expect.stringContaining("2_second.js"),
      undefined,
      undefined,
    );
    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(
      expect.stringContaining("10_last.ts"),
      undefined,
    );
  });

  test("deployScripts fails when no scripts are found", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    await deployer.deployScripts();

    expect(deployer["failSpinner"]).toHaveBeenCalledWith("No deploy scripts found.");
  });

  test("deployScripts handles script execution errors", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["1_failing.ts"] as any);
    vi.spyOn(deployer as any, "executeTsScript").mockRejectedValue(new Error("Script error"));

    await deployer.deployScripts();

    expect(deployer["failSpinner"]).toHaveBeenCalledWith(
      expect.stringContaining("Error executing script:"),
      expect.any(Error),
    );
  });

  test("executeJsScript fails gracefully", async () => {
    const filePath = "/mocked/script.js";

    await deployer["executeJsScript"](filePath);

    expect(deployer["failSpinner"]).toHaveBeenCalledWith(
      expect.stringContaining("Error executing:"),
      expect.any(Error),
    );
  });

  test("deploy fails when contract code is empty", async () => {
    const options: DeployOptions = {contract: "/mocked/contract/path"};

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("");

    await deployer.deploy(options);

    expect(deployer["failSpinner"]).toHaveBeenCalledWith("Contract code is empty.");
  });

  test("deployScripts correctly sorts mixed numbered and non-numbered scripts", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      "script.ts",
      "2alpha_script.ts",
      "3alpha_script.ts",
      "blpha_script.ts",
      "clpha_script.ts",
    ] as any);

    vi.spyOn(deployer as any, "executeTsScript").mockResolvedValue(undefined);
    vi.spyOn(deployer as any, "executeJsScript").mockResolvedValue(undefined);

    await deployer.deployScripts();

    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(expect.stringContaining("script.ts"), undefined);
    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(
      expect.stringContaining("2alpha_script.ts"),
      undefined,
    );
    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(
      expect.stringContaining("3alpha_script.ts"),
      undefined,
    );
    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(
      expect.stringContaining("blpha_script.ts"),
      undefined,
    );
    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(
      expect.stringContaining("clpha_script.ts"),
      undefined,
    );
  });

  test("executeJsScript fails if module has no default export", async () => {
    const filePath = "/mocked/script.js";

    vi.doMock(pathToFileURL(filePath).href, () => ({default: "Not a function"}));

    await deployer["executeJsScript"](filePath);

    expect(deployer["failSpinner"]).toHaveBeenCalledWith(
      expect.stringContaining('No "default" function found in:'),
    );
  });

  test("executeJsScript successfully executes a script", async () => {
    const filePath = "/mocked/script.js";
    const mockFn = vi.fn(); // This mock function simulates the script execution

    vi.doMock(pathToFileURL(filePath).href, () => ({default: mockFn}));

    await deployer["executeJsScript"](filePath);

    expect(mockFn).toHaveBeenCalledWith(mockClient);

    expect(deployer["succeedSpinner"]).toHaveBeenCalledWith(`Successfully executed: ${filePath}`);
  });

  test("executeTsScript fails when buildSync throws an error", async () => {
    const filePath = "/mocked/script.ts";
    const error = new Error("Build failed");

    vi.mocked(buildSync).mockImplementation(() => {
      throw error; // Simulate an error during transpilation
    });

    await deployer["executeTsScript"](filePath);

    expect(deployer["failSpinner"]).toHaveBeenCalledWith(`Error executing: ${filePath}`, error);
  });

  test("deploys contract with rpc option", async () => {
    const options: DeployOptions = {
      contract: "/mocked/contract/path",
      args: [1, 2, 3],
      rpc: "https://custom-rpc-url.com",
    };
    const contractContent = "contract code";

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(contractContent);
    vi.mocked(mockClient.deployContract).mockResolvedValue("mocked_tx_hash");
    vi.mocked(mockClient.waitForTransactionReceipt).mockResolvedValue({
      data: {contract_address: "0xdasdsadasdasdada"},
    });

    await deployer.deploy(options);

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://custom-rpc-url.com",
      }),
    );
    expect(fs.readFileSync).toHaveBeenCalledWith(options.contract, "utf-8");
    expect(mockClient.deployContract).toHaveBeenCalledWith({
      code: contractContent,
      args: [1, 2, 3],
      leaderOnly: false,
    });
  });

  test("executeJsScript uses rpc url when provided", async () => {
    const filePath = "/mocked/script.js";
    const rpcUrl = "https://custom-rpc-url.com";
    const mockFn = vi.fn();

    vi.doMock(pathToFileURL(filePath).href, () => ({default: mockFn}));

    await deployer["executeJsScript"](filePath, undefined, rpcUrl);

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: rpcUrl,
      }),
    );
    expect(mockFn).toHaveBeenCalledWith(mockClient);
    expect(deployer["succeedSpinner"]).toHaveBeenCalledWith(`Successfully executed: ${filePath}`);
  });

  test("executeTsScript passes rpc url to executeJsScript", async () => {
    const filePath = "/mocked/script.ts";
    const outFile = "/mocked/script.compiled.js";
    const rpcUrl = "https://custom-rpc-url.com";

    vi.spyOn(deployer as any, "executeJsScript").mockResolvedValue(undefined);
    vi.mocked(buildSync).mockImplementation((() => {}) as any);

    await deployer["executeTsScript"](filePath, rpcUrl);

    expect(deployer["startSpinner"]).toHaveBeenCalledWith(`Transpiling TypeScript file: ${filePath}`);
    expect(buildSync).toHaveBeenCalledWith({
      entryPoints: [filePath],
      outfile: outFile,
      bundle: false,
      platform: "node",
      format: "esm",
      target: "es2020",
      sourcemap: false,
    });

    expect(deployer["executeJsScript"]).toHaveBeenCalledWith(filePath, outFile, rpcUrl);
    expect(fs.unlinkSync).toHaveBeenCalledWith(outFile);
  });

  test("deployScripts passes rpc url to script execution methods", async () => {
    const rpcUrl = "https://custom-rpc-url.com";

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["1_first.ts", "2_second.js"] as any);

    vi.spyOn(deployer as any, "executeTsScript").mockResolvedValue(undefined);
    vi.spyOn(deployer as any, "executeJsScript").mockResolvedValue(undefined);

    await deployer.deployScripts({rpc: rpcUrl});

    expect(deployer["executeTsScript"]).toHaveBeenCalledWith(expect.stringMatching(/1_first.ts/), rpcUrl);
    expect(deployer["executeJsScript"]).toHaveBeenCalledWith(
      expect.stringMatching(/2_second.js/),
      undefined,
      rpcUrl,
    );
  });
});
