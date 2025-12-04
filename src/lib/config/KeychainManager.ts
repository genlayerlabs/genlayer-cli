import {default as keytar} from 'keytar';

export class KeychainManager {
  private static readonly SERVICE = 'genlayer-cli';

  constructor() {}

  private getKeychainAccount(accountName: string): string {
    return `account:${accountName}`;
  }

  async isKeychainAvailable(): Promise<boolean> {
    try {
      await keytar.findCredentials('test-service');
      return true;
    } catch {
      return false;
    }
  }

  async storePrivateKey(accountName: string, privateKey: string): Promise<void> {
    return await keytar.setPassword(KeychainManager.SERVICE, this.getKeychainAccount(accountName), privateKey);
  }

  async getPrivateKey(accountName: string): Promise<string | null> {
    return await keytar.getPassword(KeychainManager.SERVICE, this.getKeychainAccount(accountName));
  }

  async removePrivateKey(accountName: string): Promise<boolean> {
    return await keytar.deletePassword(KeychainManager.SERVICE, this.getKeychainAccount(accountName));
  }

  async listUnlockedAccounts(): Promise<string[]> {
    const credentials = await keytar.findCredentials(KeychainManager.SERVICE);
    return credentials
      .map(c => c.account)
      .filter(a => a.startsWith('account:'))
      .map(a => a.replace('account:', ''));
  }

  async isAccountUnlocked(accountName: string): Promise<boolean> {
    const key = await this.getPrivateKey(accountName);
    return key !== null;
  }
} 