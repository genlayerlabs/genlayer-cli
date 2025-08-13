import path from "path";
import os from "os";
import fs from "fs";

export class ConfigFileManager {
  private folderPath: string;
  private configFilePath: string;

  constructor(baseFolder: string = ".genlayer/", configFileName: string = "genlayer-config.json") {
    this.folderPath = path.resolve(os.homedir(), baseFolder);
    this.configFilePath = path.resolve(this.folderPath, configFileName);
    this.ensureFolderExists();
    this.ensureConfigFileExists();
  }

  private ensureFolderExists(): void {
    if (!fs.existsSync(this.folderPath)) {
      fs.mkdirSync(this.folderPath, { recursive: true });
    }
  }

  private ensureConfigFileExists(): void {
    if (!fs.existsSync(this.configFilePath)) {
      fs.writeFileSync(this.configFilePath, JSON.stringify({}, null, 2));
    }
  }

  getFolderPath(): string {
    return this.folderPath;
  }

  getFilePath(fileName: string): string {
    return path.resolve(this.folderPath, fileName);
  }

  getConfig(): Record<string, any> {
    const configContent = fs.readFileSync(this.configFilePath, "utf-8");
    return JSON.parse(configContent);
  }

  getConfigByKey(key: string): any {
    const config = this.getConfig();
    return config[key] !== undefined ? config[key] : null;
  }

  writeConfig(key: string, value: any): void {
    const config = this.getConfig();
    config[key] = value;
    fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
  }
}
