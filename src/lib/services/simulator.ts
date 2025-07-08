import Docker, {ContainerInfo} from "dockerode";
import * as fs from "fs";
import * as dotenv from "dotenv";
import * as path from "path";
import * as semver from "semver";
import updateCheck from "update-check";
import { fileURLToPath } from "url";
import pkg from '../../../package.json'

import {rpcClient} from "../clients/jsonRpcClient";
import {
  DEFAULT_RUN_SIMULATOR_COMMAND,
  DEFAULT_RUN_DOCKER_COMMAND,
  STARTING_TIMEOUT_WAIT_CYLCE,
  STARTING_TIMEOUT_ATTEMPTS,
  AI_PROVIDERS_CONFIG,
  AiProviders,
  VERSION_REQUIREMENTS,
  CONTAINERS_NAME_PREFIX,
  IMAGES_NAME_PREFIX,
  GENLAYER_REQUIRED_CONTAINERS
} from "../config/simulator";
import {
  checkCommand,
  getVersion,
  executeCommand,
  openUrl,
} from "../clients/system";
import {MissingRequirementError} from "../errors/missingRequirement";

import {
  ISimulatorService,
  WaitForSimulatorToBeReadyResultType,
} from "../interfaces/ISimulatorService";
import {VersionRequiredError} from "../errors/versionRequired";


function sleep(millliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, millliseconds));
}

export class SimulatorService implements ISimulatorService {
  private profileOptions: string
  private docker: Docker;
  public location: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    this.location = path.resolve(path.dirname(__filename), '..');
    this.profileOptions = "";
    this.docker = new Docker();
  }

  private readEnvConfigValue(key: string): string {
    const envFilePath = path.join(this.location, ".env");
    // Transform the config string to object
    const envConfig = dotenv.parse(fs.readFileSync(envFilePath, "utf8"));
    return envConfig[key];
  }

  private async getGenlayerContainers(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({ all: true });
    return containers.filter(container =>
      container.Names.some(name =>
        name.startsWith(CONTAINERS_NAME_PREFIX)
      )
    );
  }

  private async stopAndRemoveContainers(remove: boolean = false): Promise<void> {
    const genlayerContainers = await this.getGenlayerContainers();

    for (const containerInfo of genlayerContainers) {
      const container = this.docker.getContainer(containerInfo.Id);
      if (containerInfo.State === "running") {
        await container.stop();
      }

      const isOllamaContainer = containerInfo.Names.some(name => name.includes("ollama"));

      if (remove && !isOllamaContainer) {
        await container.remove();
      }
    }
  }

  public addConfigToEnvFile(newConfig: Record<string, string>): void {
    const envFilePath = path.join(this.location, ".env");

    // Transform the config string to object
    const envConfig = dotenv.parse(fs.readFileSync(envFilePath, "utf8"));
    Object.keys(newConfig).forEach(key => {
      envConfig[key] = newConfig[key];
    });

    // Transform the updated config object back into a string
    const updatedConfig = Object.keys(envConfig)
      .map(key => {
        return `${key}=${envConfig[key]}`;
      })
      .join("\n");

    // Write the new .env file
    fs.writeFileSync(envFilePath, updatedConfig);
  }

  public setComposeOptions(headless: boolean, ollama: boolean = false): void {
    let profiles = [];
    
    if (!headless) {
      profiles.push("frontend");
    }
    
    if (ollama) {
      profiles.push("ollama");
    }
    
    this.profileOptions = profiles.length > 0 ? `--profile ${profiles.join(" --profile ")}` : "";
  }

  public getComposeOptions(): string {
    return this.profileOptions;
  }

  public async checkCliVersion(): Promise<void> {
    const update = await updateCheck(pkg);
    if (update && update.latest !== pkg.version) {
      console.warn(`\nA new version (${update.latest}) is available! You're using version ${pkg.version}.\nRun npm install -g genlayer to update\n`);
    }
  }

  public async checkInstallRequirements(): Promise<Record<string, boolean>> {
    const requirementsInstalled = {
      docker: false,
    };

    try {
      await checkCommand("docker --version", "docker");
      requirementsInstalled.docker = true;
    } catch (error: any) {
      if (!(error instanceof MissingRequirementError)) {
        throw error;
      }
    }

    if (requirementsInstalled.docker) {
      try {
        await this.docker.ping()
      } catch (error: any) {
        await executeCommand(DEFAULT_RUN_DOCKER_COMMAND);
      }
    }

    return requirementsInstalled;
  }

  public async checkVersionRequirements(): Promise<Record<string, string>> {
    const missingVersions = {
      docker: "",
      node: "",
    };

    try {
      await this.checkVersion(VERSION_REQUIREMENTS.node, "node");
    } catch (error: any) {
      missingVersions.node = VERSION_REQUIREMENTS.node;
      if (!(error instanceof VersionRequiredError)) {
        throw error;
      }
    }

    try {
      await this.checkVersion(VERSION_REQUIREMENTS.docker, "docker");
    } catch (error: any) {
      missingVersions.docker = VERSION_REQUIREMENTS.docker;
      if (!(error instanceof VersionRequiredError)) {
        throw error;
      }
    }

    return missingVersions;
  }

  public async checkVersion(minVersion: string, toolName: string): Promise<void> {
    const version = await getVersion(toolName);

    if (!semver.satisfies(version, `>=${minVersion}`)) {
      throw new VersionRequiredError(toolName, minVersion);
    }
  }

  public runSimulator(): Promise<{stdout: string; stderr: string}> {
    const commandsByPlatform = DEFAULT_RUN_SIMULATOR_COMMAND(this.location, this.getComposeOptions());
    return executeCommand(commandsByPlatform);
  }

  public async waitForSimulatorToBeReady(
    retries: number = STARTING_TIMEOUT_ATTEMPTS,
  ): Promise<WaitForSimulatorToBeReadyResultType> {
    try {
      const response = await rpcClient.request({method: "ping", params: []});

      //Compatibility with current simulator version
      if (response?.result === "OK" || response?.result?.status === "OK" || response?.result?.data?.status === "OK") {
        return { initialized: true };
      }
      if (retries > 0) {
        await sleep(STARTING_TIMEOUT_WAIT_CYLCE);
        return this.waitForSimulatorToBeReady(retries - 1);
      }
    } catch (error: any) {
      if (
        (error.name === "FetchError" ||
          error.message.includes("Fetch Error") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("ECONNREFUSED") ||
          error.message.includes("socket hang up")) &&
        retries > 0
      ) {
        await sleep(STARTING_TIMEOUT_WAIT_CYLCE * 2);
        return this.waitForSimulatorToBeReady(retries - 1);
      }
      return {initialized: false, errorCode: "ERROR", errorMessage: error.message};
    }

    return {initialized: false, errorCode: "TIMEOUT"};
  }

  public createRandomValidators(numValidators: number, llmProviders: AiProviders[]): Promise<any> {
    return rpcClient.request({
      method: "sim_createRandomValidators",
      params: [numValidators, 1, 10, llmProviders],
    });
  }

  public deleteAllValidators(): Promise<any> {
    return rpcClient.request({method: "sim_deleteAllValidators", params: []});
  }

  public getAiProvidersOptions(withHint: boolean = true, excludeProviders: AiProviders[] = []): Array<{name: string; value: string}> {
    return Object.values(AI_PROVIDERS_CONFIG)
      .filter(providerConfig => !excludeProviders.includes(providerConfig.cliOptionValue as AiProviders))
      .map(providerConfig => {
        return {
          name: `${providerConfig.name}${withHint ? ` ${providerConfig.hint}` : ""}`,
          value: providerConfig.cliOptionValue,
        };
      });
  }

  public getFrontendUrl(): string {
    const frontendPort = this.readEnvConfigValue("FRONTEND_PORT");
    return `http://localhost:${frontendPort}`;
  }

  public async openFrontend(): Promise<boolean> {
    await openUrl(this.getFrontendUrl());
    return true;
  }

  public async stopDockerContainers(): Promise<void> {
    await this.stopAndRemoveContainers(false);
  }

  public async resetDockerContainers(): Promise<void> {
    await this.stopAndRemoveContainers(true);
  }

  public async resetDockerImages(): Promise<void> {
    const images = await this.docker.listImages();
    const genlayerImages = images.filter(image =>
      image.RepoTags?.some(tag => tag.startsWith(IMAGES_NAME_PREFIX))
    );

    for (const imageInfo of genlayerImages) {
      const image = this.docker.getImage(imageInfo.Id);
      await image.remove({force: true});
    }
  }

  public async cleanDatabase(): Promise<boolean> {

    try {
      await rpcClient.request({method: "sim_clearDbTables", params: [['current_state', 'transactions']]});
    }catch (error) {
      console.error(error);
    }
    return true;
  }

  public normalizeLocalnetVersion(version: string) {

    if (!version.startsWith('v')) {
      version = 'v' + version;
    }

    const versionRegex = /^v(\d+)\.(\d+)\.(\d+)(-.+)?$/;
    const match = version.match(versionRegex);

    if (!match) {
      console.error('Invalid version format. Expected format: v0.0.0 or v0.0.0-suffix');
      process.exit(1);
    }

    return version
  }

  public async isLocalnetRunning(): Promise<boolean> {
    const genlayerContainers = await this.getGenlayerContainers();
    const runningContainers = genlayerContainers.filter(container => container.State === "running");
    
    return GENLAYER_REQUIRED_CONTAINERS.every(requiredContainer => 
      runningContainers.some(container => 
        container.Names.some(name => name.includes(requiredContainer))
      )
    );
  }

}

export default new SimulatorService();
