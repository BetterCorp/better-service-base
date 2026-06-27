export interface PasskeyVerifier {
  verifyRegistration(credential: Record<string, unknown>): Promise<Record<string, unknown>>;
  verifyAuthentication(credential: Record<string, unknown>, storedPublicKey: Record<string, unknown>): Promise<boolean>;
}

export class JsonPasskeyVerifier implements PasskeyVerifier {
  async verifyRegistration(credential: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (typeof credential.id !== 'string' || credential.id.length < 8) {
      throw new Error('Invalid passkey credential');
    }
    return credential;
  }

  async verifyAuthentication(credential: Record<string, unknown>, storedPublicKey: Record<string, unknown>): Promise<boolean> {
    return typeof credential.id === 'string' && credential.id === storedPublicKey.id;
  }
}
