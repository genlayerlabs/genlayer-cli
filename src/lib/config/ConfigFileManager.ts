import path from "path";
import os from "os";
import fs from "fs";

export interface AccountInfo {
  name: string;
  address: string;
  path: string;
}

export class ConfigFileManager {
  private folderPath: string;
  private configFilePath: string;
  private keystoresPath: string;

  constructor(baseFolder: string = ".genlayer/", configFileName: string = "genlayer-config.json") {
    this.folderPath = path.resolve(os.homedir(), baseFolder);
    this.configFilePath = path.resolve(this.folderPath, configFileName);
    this.keystoresPath = path.resolve(this.folderPath, "keystores");
    this.ensureFolderExists();
    this.ensureKeystoresDirExists();
    this.ensureConfigFileExists();
    this.migrateOldConfig();
    this.migrateKeystoreFormats();
  }

  private ensureFolderExists(): void {
    if (!fs.existsSync(this.folderPath)) {
      fs.mkdirSync(this.folderPath, { recursive: true });
    }
  }

  private ensureKeystoresDirExists(): void {
    if (!fs.existsSync(this.keystoresPath)) {
      fs.mkdirSync(this.keystoresPath, { recursive: true });
    }
  }

  private ensureConfigFileExists(): void {
    if (!fs.existsSync(this.configFilePath)) {
      fs.writeFileSync(this.configFilePath, JSON.stringify({}, null, 2));
    }
  }

  private migrateOldConfig(): void {
    const config = this.getConfig();
    if (config.keyPairPath && !config.activeAccount) {
      const oldPath = config.keyPairPath;
      if (fs.existsSync(oldPath)) {
        const newPath = this.getKeystorePath("default");
        // Read old keystore and convert format if needed
        const content = fs.readFileSync(oldPath, "utf-8");
        const web3Content = this.convertToWeb3Format(content);
        fs.writeFileSync(newPath, web3Content);
        delete config.keyPairPath;
        config.activeAccount = "default";
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
      }
    }
  }

  private migrateKeystoreFormats(): void {
    if (!fs.existsSync(this.keystoresPath)) {
      return;
    }
    const files = fs.readdirSync(this.keystoresPath);
    if (!Array.isArray(files)) {
      return;
    }
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.resolve(this.keystoresPath, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        // Check if it's old GenLayer format (has 'encrypted' string field)
        if (parsed.encrypted && typeof parsed.encrypted === "string") {
          const web3Content = this.convertToWeb3Format(content);
          fs.writeFileSync(filePath, web3Content);
        }
        // If it has 'crypto' field, it's already web3 format - skip
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  private convertToWeb3Format(content: string): string {
    try {
      const parsed = JSON.parse(content);
      // If it's GenLayer wrapper format (has 'encrypted' string field)
      if (parsed.encrypted && typeof parsed.encrypted === "string") {
        // The 'encrypted' field contains the actual web3 keystore JSON
        return parsed.encrypted;
      }
      // Already web3 format or unknown - return as-is
      return content;
    } catch {
      return content;
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

  removeConfig(key: string): void {
    const config = this.getConfig();
    delete config[key];
    fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
  }

  getKeystoresPath(): string {
    return this.keystoresPath;
  }

  getKeystorePath(name: string): string {
    return path.resolve(this.keystoresPath, `${name}.json`);
  }

  accountExists(name: string): boolean {
    return fs.existsSync(this.getKeystorePath(name));
  }

  getActiveAccount(): string | null {
    return this.getConfigByKey("activeAccount");
  }

  setActiveAccount(name: string): void {
    if (!this.accountExists(name)) {
      throw new Error(`Account '${name}' does not exist`);
    }
    this.writeConfig("activeAccount", name);
  }

  listAccounts(): AccountInfo[] {
    if (!fs.existsSync(this.keystoresPath)) {
      return [];
    }
    const files = fs.readdirSync(this.keystoresPath);
    const accounts: AccountInfo[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const name = file.replace(".json", "");
      const filePath = this.getKeystorePath(name);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const addr = content.address || "unknown";
        accounts.push({
          name,
          address: addr.startsWith("0x") ? addr : `0x${addr}`,
          path: filePath,
        });
      } catch {
        // Skip invalid files
      }
    }
    return accounts;
  }

  removeAccount(name: string): void {
    const keystorePath = this.getKeystorePath(name);
    if (!fs.existsSync(keystorePath)) {
      throw new Error(`Account '${name}' does not exist`);
    }
    fs.unlinkSync(keystorePath);

    // If this was the active account, clear it
    if (this.getActiveAccount() === name) {
      this.removeConfig("activeAccount");
    }
  }
}
