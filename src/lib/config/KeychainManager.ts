type Keytar = typeof import('keytar').default;

let keytarModule: Keytar | null = null;
let keytarLoadAttempted = false;

async function getKeytar(): Promise<Keytar | null> {
  if (keytarLoadAttempted) return keytarModule;
  keytarLoadAttempted = true;
  try {
    const mod = await import('keytar');
    keytarModule = mod.default ?? mod;
    return keytarModule;
  } catch {
    return null;
  }
}

export class KeychainManager {
  private static readonly SERVICE = 'genlayer-cli';

  constructor() {}

  private getKeychainAccount(accountName: string): string {
    return `account:${accountName}`;
  }

  async isKeychainAvailable(): Promise<boolean> {
    try {
      const keytar = await getKeytar();
      if (!keytar) return false;
      await keytar.findCredentials('test-service');
      return true;
    } catch {
      return false;
    }
  }

  async storePrivateKey(accountName: string, privateKey: string): Promise<void> {
    const keytar = await getKeytar();
    if (!keytar) throw new Error('Keychain not available. Install libsecret-1-dev on Linux.');
    try {
      return await keytar.setPassword(KeychainManager.SERVICE, this.getKeychainAccount(accountName), privateKey);
    } catch (error: any) {
      if (error?.message?.includes('org.freedesktop.secrets')) {
        throw new Error('Keychain service not running. Install and start gnome-keyring or another secrets service.');
      }
      throw error;
    }
  }

  async getPrivateKey(accountName: string): Promise<string | null> {
    const keytar = await getKeytar();
    if (!keytar) return null;
    try {
      return await keytar.getPassword(KeychainManager.SERVICE, this.getKeychainAccount(accountName));
    } catch {
      return null;
    }
  }

  async removePrivateKey(accountName: string): Promise<boolean> {
    const keytar = await getKeytar();
    if (!keytar) return false;
    try {
      return await keytar.deletePassword(KeychainManager.SERVICE, this.getKeychainAccount(accountName));
    } catch {
      return false;
    }
  }

  async listUnlockedAccounts(): Promise<string[]> {
    const keytar = await getKeytar();
    if (!keytar) return [];
    try {
      const credentials = await keytar.findCredentials(KeychainManager.SERVICE);
      return credentials
        .map(c => c.account)
        .filter(a => a.startsWith('account:'))
        .map(a => a.replace('account:', ''));
    } catch {
      return [];
    }
  }

  async isAccountUnlocked(accountName: string): Promise<boolean> {
    const key = await this.getPrivateKey(accountName);
    return key !== null;
  }
} 