import { randomBytes, randomUUID } from 'crypto';
import { Observable } from '@bsb/base';
import type { RegistryDB } from './db';
import type {
  User,
  AuthToken,
  UserPermission,
  ResourcePermission,
  OrgMember,
  PackagePermission,
} from './types';

export interface AuthConfig {
  requireAuth: boolean;
}

/**
 * Result of resolving a bearer token to a user.
 * `effectivePermissions` is the intersection of user permissions and token permissions.
 */
export interface ResolvedAuth {
  userId: string;
  user: User;
  token: AuthToken;
  effectivePermissions: UserPermission[];
}

/**
 * Authentication and user management for the registry.
 *
 * All persistence is delegated to the RegistryDB instance.
 * AuthManager owns the business logic (permission checks, token
 * construction, permission clamping) but never touches the filesystem.
 */
export class AuthManager {
  private readonly db: RegistryDB;
  public readonly requireAuth: boolean;

  constructor(config: AuthConfig, db: RegistryDB) {
    this.requireAuth = config.requireAuth;
    this.db = db;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async init(obs: Observable): Promise<void> {
    const span = obs.startSpan('AuthManager.init');
    try {
      if (!this.requireAuth) {
        obs.log.info('Authentication disabled');
        return;
      }
      obs.log.info('AuthManager initialized (storage delegated to RegistryDB)');
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // User CRUD
  // ============================================================================

  async createUser(obs: Observable, name: string, email: string, permissions: UserPermission[]): Promise<User> {
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      name,
      email,
      active: true,
      permissions,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.createUser(obs, user);
    return user;
  }

  async getUser(obs: Observable, userId: string): Promise<User | null> {
    return this.db.getUser(obs, userId);
  }

  async getUserByEmail(obs: Observable, email: string): Promise<User | null> {
    return this.db.getUserByEmail(obs, email);
  }

  async listUsers(obs: Observable): Promise<User[]> {
    return this.db.listUsers(obs);
  }

  async updateUser(
    obs: Observable,
    userId: string,
    updates: Partial<Pick<User, 'name' | 'email' | 'active' | 'permissions'>>,
  ): Promise<User | null> {
    return this.db.updateUser(obs, userId, updates);
  }

  async deactivateUser(obs: Observable, userId: string): Promise<boolean> {
    const result = await this.db.updateUser(obs, userId, { active: false });
    return result !== null;
  }

  // ============================================================================
  // Token management (tied to user)
  // ============================================================================

  /**
   * Create a new API token for a user.
   *
   * `tokenPermissions` if provided must be a subset of the user's permissions.
   * Any permission in `tokenPermissions` that the user does not have is silently
   * dropped. If omitted, the token inherits all user permissions at resolve time.
   */
  async createToken(
    obs: Observable,
    userId: string,
    label: string,
    tokenPermissions?: UserPermission[],
    expiresAt?: string,
  ): Promise<AuthToken | null> {
    const user = await this.db.getUser(obs, userId);
    if (!user || !user.active) return null;

    // Clamp token permissions to user permissions (token can never exceed user)
    let perms: UserPermission[] | undefined;
    if (tokenPermissions) {
      perms = tokenPermissions.filter(p => user.permissions.includes(p));
    }

    const token: AuthToken = {
      token: `bsb_${randomBytes(32).toString('hex')}`,
      userId,
      name: label,
      permissions: perms,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    await this.db.createToken(obs, token);
    return token;
  }

  /**
   * Resolve a bearer token string to the owning user.
   *
   * Returns null if the token is invalid, expired, or the user is inactive.
   * `effectivePermissions` is the intersection of user and token permissions.
   * If the token has no explicit permissions, user permissions are inherited.
   */
  async resolveToken(obs: Observable, tokenString: string): Promise<ResolvedAuth | null> {
    const token = await this.db.getToken(obs, tokenString);
    if (!token) return null;

    // Check expiration
    if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
      return null;
    }

    const user = await this.db.getUser(obs, token.userId);
    if (!user || !user.active) return null;

    // Compute effective permissions: intersection of user and token
    let effectivePermissions: UserPermission[];
    if (token.permissions && token.permissions.length > 0) {
      // Token has explicit scope -- intersect with current user permissions
      effectivePermissions = token.permissions.filter(p => user.permissions.includes(p));
    } else {
      // Token inherits all user permissions
      effectivePermissions = [...user.permissions];
    }

    return { userId: user.id, user, token, effectivePermissions };
  }

  /**
   * Get all tokens belonging to a user.
   */
  async getTokensForUser(obs: Observable, userId: string): Promise<AuthToken[]> {
    return this.db.getTokensForUser(obs, userId);
  }

  /**
   * Revoke (delete) a specific token.
   */
  async revokeToken(obs: Observable, tokenString: string): Promise<boolean> {
    return this.db.deleteToken(obs, tokenString);
  }

  /**
   * Revoke all tokens belonging to a user.
   */
  async revokeAllTokensForUser(obs: Observable, userId: string): Promise<number> {
    return this.db.deleteTokensForUser(obs, userId);
  }

  // ============================================================================
  // Permission checking (pure logic -- no storage access)
  // ============================================================================

  /**
   * Check if the resolved auth has a specific user-level permission.
   * Uses `effectivePermissions` (intersection of user + token perms).
   */
  hasUserPermission(auth: ResolvedAuth, required: UserPermission): boolean {
    return auth.effectivePermissions.includes(required);
  }

  /**
   * Check if a user has the required resource-level permission on a package.
   *
   * Resolution order:
   *  1. Package-level permissions (if any) -- explicit grant wins
   *  2. Org-level membership -- inherited from org members list
   *  3. Deny
   *
   * The caller must also separately check that the auth token has the
   * user-level 'write' permission for write operations.
   */
  hasResourcePermission(
    userId: string,
    requiredLevel: ResourcePermission,
    packagePermissions: PackagePermission[] | undefined,
    orgMembers: OrgMember[] | undefined,
  ): boolean {
    // 1. Check package-level permissions first
    if (packagePermissions && packagePermissions.length > 0) {
      const pkgPerm = packagePermissions.find(p => p.userId === userId);
      if (pkgPerm) {
        return this.resourcePermSatisfies(pkgPerm.permission, requiredLevel);
      }
    }

    // 2. Fall back to org membership
    if (orgMembers && orgMembers.length > 0) {
      const orgMember = orgMembers.find(m => m.userId === userId);
      if (orgMember) {
        return this.resourcePermSatisfies(orgMember.permission, requiredLevel);
      }
    }

    // 3. No permission found
    return false;
  }

  /**
   * Check if the granted resource permission satisfies the required level.
   * 'write' satisfies both 'read' and 'write'.
   * 'read' only satisfies 'read'.
   */
  private resourcePermSatisfies(granted: ResourcePermission, required: ResourcePermission): boolean {
    if (granted === 'write') return true; // write implies read
    return required === 'read';
  }
}
