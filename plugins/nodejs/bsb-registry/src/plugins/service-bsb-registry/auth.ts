import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { Observable } from '@bsb/base';

export interface AuthConfig {
  tokensFile: string;
  requireAuth: boolean;
}

export interface TokenInfo {
  token: string;
  name: string;
  createdAt: string;
}

/**
 * Authentication manager for the registry.
 *
 * Handles:
 * - Loading and saving API tokens from file
 * - Generating new tokens
 * - Token validation (delegated to HTTP server)
 */
export class AuthManager {
  private tokens: Map<string, TokenInfo> = new Map();

  constructor(private config: AuthConfig) {}

  /**
   * Initialize authentication - load tokens from file
   */
  async init(obs: Observable): Promise<void> {
    const span = obs.startSpan('AuthManager.init');

    try {
      if (!this.config.requireAuth) {
        obs.log.info('Authentication disabled');
        span.end();
        return;
      }

      // Ensure directory exists
      const dir = dirname(this.config.tokensFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Load tokens if file exists
      if (existsSync(this.config.tokensFile)) {
        const content = readFileSync(this.config.tokensFile, 'utf-8');
        const tokenData = JSON.parse(content) as TokenInfo[];

        tokenData.forEach(info => {
          this.tokens.set(info.token, info);
        });

        obs.log.info('Loaded {count} API tokens', { count: this.tokens.size });
      } else {
        // Create empty tokens file
        writeFileSync(this.config.tokensFile, JSON.stringify([], null, 2));
        obs.log.info('Created empty tokens file at {path}', { path: this.config.tokensFile });
      }
    } catch (error) {
      obs.log.error('Error: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get all token strings (for HTTP server)
   */
  getTokenStrings(): string[] {
    return Array.from(this.tokens.keys());
  }

  /**
   * Get all token info
   */
  getAllTokens(): TokenInfo[] {
    return Array.from(this.tokens.values());
  }

  /**
   * Generate a new API token
   */
  generateToken(name: string): string {
    const token = this.createRandomToken();
    const info: TokenInfo = {
      token,
      name,
      createdAt: new Date().toISOString(),
    };

    this.tokens.set(token, info);
    this.saveTokens();

    return token;
  }

  /**
   * Revoke a token
   */
  revokeToken(token: string): boolean {
    const deleted = this.tokens.delete(token);
    if (deleted) {
      this.saveTokens();
    }
    return deleted;
  }

  /**
   * Check if a token is valid
   */
  isValidToken(token: string): boolean {
    return this.tokens.has(token);
  }

  /**
   * Save tokens to file
   */
  private saveTokens(): void {
    const tokenArray = Array.from(this.tokens.values());
    writeFileSync(this.config.tokensFile, JSON.stringify(tokenArray, null, 2));
  }

  /**
   * Create a random token string
   */
  private createRandomToken(): string {
    return randomBytes(32).toString('hex');
  }
}
