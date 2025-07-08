import {AiProviders} from "../config/simulator";

export interface ISimulatorService {
  setComposeOptions(headless: boolean, disableOllama?: boolean): void;
  getComposeOptions(): string;
  checkInstallRequirements(): Promise<Record<string, boolean>>;
  checkVersionRequirements(): Promise<Record<string, string>>;
  runSimulator(): Promise<{stdout: string; stderr: string}>;
  waitForSimulatorToBeReady(retries?: number): Promise<WaitForSimulatorToBeReadyResultType>;
  createRandomValidators(numValidators: number, llmProviders: AiProviders[]): Promise<any>;
  deleteAllValidators(): Promise<any>;
  getAiProvidersOptions(withHint: boolean, excludeProviders?: AiProviders[]): Array<{name: string; value: string}>;
  getFrontendUrl(): string;
  openFrontend(): Promise<boolean>;
  stopDockerContainers(): Promise<void>;
  resetDockerContainers(): Promise<void>;
  resetDockerImages(): Promise<void>;
  checkCliVersion(): Promise<void>;
  cleanDatabase(): Promise<boolean>;
  addConfigToEnvFile(newConfig: Record<string, string>): void;
  normalizeLocalnetVersion(version: string): string;
  isLocalnetRunning(): Promise<boolean>;
}


export type WaitForSimulatorToBeReadyResultType = {
  initialized: boolean;
  errorCode?: "TIMEOUT" | "ERROR";
  errorMessage?: string;
};

export type InitializeDatabaseResultType = {
  createResponse: any;
  tablesResponse: any;
};
