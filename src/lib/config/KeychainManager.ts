import {default as keytar} from 'keytar';

export class KeychainManager {
  private static readonly SERVICE = 'genlayer-cli';
  private static readonly ACCOUNT = 'default-user';

  constructor() {}

  async isKeychainAvailable(): Promise<boolean> {
    try {
      await keytar.findCredentials('test-service');
      return true;
    } catch {
      return false;
    }
  }

  async storePrivateKey(privateKey: string): Promise<void> {
      return await keytar.setPassword(KeychainManager.SERVICE, KeychainManager.ACCOUNT, privateKey);
  }

  async getPrivateKey(): Promise<string | null> {
    return await keytar.getPassword(KeychainManager.SERVICE, KeychainManager.ACCOUNT);
  }

  async removePrivateKey(): Promise<boolean> {
    return await keytar.deletePassword(KeychainManager.SERVICE, KeychainManager.ACCOUNT);
  }
} 