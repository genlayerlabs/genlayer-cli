import path from "path";
import os from "os";
import fs from "fs";

interface TempFileData {
  content: string;
  timestamp: number;
}

export class ConfigFileManager {
  private folderPath: string;
  private configFilePath: string;
  private tempFolderPath: string;
  private static readonly TEMP_FILE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

  constructor(baseFolder: string = ".genlayer/", configFileName: string = "genlayer-config.json") {
    this.folderPath = path.resolve(os.homedir(), baseFolder);
    this.configFilePath = path.resolve(this.folderPath, configFileName);
    this.tempFolderPath = path.resolve(os.tmpdir(), "genlayer-temp");
    this.ensureFolderExists();
    this.ensureConfigFileExists();
    this.ensureTempFolderExists();
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

  private ensureTempFolderExists(): void {
    if (!fs.existsSync(this.tempFolderPath)) {
      fs.mkdirSync(this.tempFolderPath, { recursive: true, mode: 0o700 }); // Owner-only access
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

  storeTempFile(fileName: string, content: string): void {
    this.ensureTempFolderExists();
    const filePath = path.resolve(this.tempFolderPath, fileName);
    const tempData: TempFileData = {
      content,
      timestamp: Date.now()
    };
    fs.writeFileSync(filePath, JSON.stringify(tempData), { mode: 0o600 }); // Owner-only access
  }

  getTempFile(fileName: string): string | null {
    const filePath = path.resolve(this.tempFolderPath, fileName);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const tempData: TempFileData = JSON.parse(fileContent);
    
    if (Date.now() - tempData.timestamp > ConfigFileManager.TEMP_FILE_EXPIRATION_MS) {
      this.clearTempFile(fileName);
      return null;
    }

    return tempData.content;
  }

  hasTempFile(fileName: string): boolean {
    return this.getTempFile(fileName) !== null;
  }

  clearTempFile(fileName: string): void {
    const filePath = path.resolve(this.tempFolderPath, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  cleanupExpiredTempFiles(): void {
    if (!fs.existsSync(this.tempFolderPath)) {
      return;
    }

    const files = fs.readdirSync(this.tempFolderPath);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.resolve(this.tempFolderPath, file);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const tempData: TempFileData = JSON.parse(fileContent);
      
      if (now - tempData.timestamp > ConfigFileManager.TEMP_FILE_EXPIRATION_MS) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
