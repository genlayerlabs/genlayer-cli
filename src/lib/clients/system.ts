import util from "node:util";
import {ChildProcess, exec} from "child_process";
import open from "open";

import {RunningPlatform, AVAILABLE_PLATFORMS} from "../config/simulator";
import {MissingRequirementError} from "../errors/missingRequirement";

export async function checkCommand(command: string, toolName: string): Promise<void> {
  try {
    await util.promisify(exec)(command);
  }catch (error:any) {
    if (error.stderr) {
      throw new MissingRequirementError(toolName);
    }
  }
}

type ExecuteCommandResult = {
  stdout: string;
  stderr: string;
};

type ExecuteCommandByPlatformInput = {
  [key in RunningPlatform]: string;
};

export async function executeCommand(
  cmdsByPlatform: ExecuteCommandByPlatformInput,
  toolName?: string,
): Promise<ExecuteCommandResult> {
  const runningPlatform = getPlatform();
  const command = cmdsByPlatform[runningPlatform];
  try {
    return await util.promisify(exec)(command);
  } catch (error: any) {
    throw new Error(`Error executing ${toolName || command}: ${error.message}.`);
  }
}

function getPlatform(): RunningPlatform {
  const currentPlatform = process.platform as RunningPlatform;
  if (!AVAILABLE_PLATFORMS.includes(currentPlatform)) {
    throw new Error(`Unsupported platform: ${currentPlatform}.`);
  }
  return currentPlatform;
}

export function openUrl(url: string): Promise<ChildProcess> {
  return open(url);
}

export async function getVersion(toolName: string): Promise<string> {
  let toolResponse;
  try {
    toolResponse = await util.promisify(exec)(`${toolName} --version`);
  } catch {
    throw new Error(`Error getting ${toolName} version.`);
  }

  if (toolResponse.stderr) {
    throw new Error(`Error getting ${toolName} version.`);
  }

  const versionMatch = toolResponse.stdout?.match(/(\d+\.\d+\.\d+)/);
  if (versionMatch) {
    return versionMatch[1];
  }
  throw new Error(`Could not parse ${toolName} version from output: ${toolResponse.stdout}`);
}
