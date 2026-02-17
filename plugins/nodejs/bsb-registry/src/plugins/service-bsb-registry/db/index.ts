/**
 * Database interface and factory for BSB Registry storage.
 *
 * All storage backends (file, postgres, etc.) must implement RegistryDB.
 * Use createStorage() to get the right implementation for a given config.
 */

import type { Observable } from '@bsb/base';
import type {
  RegistryEntry,
  ListQuery,
  SearchQuery,
  RegistryStats,
  VersionInfo,
  Organization,
  OrgMember,
  ResourcePermission,
  User,
  AuthToken,
} from '../types';
import { FileDB } from './file';

export interface RegistryDB {
  /** Initialize the database (create dirs, run migrations, etc.) */
  init(obs: Observable): Promise<void>;

  /** Clean up resources (close handles, flush writes, etc.) */
  dispose(): Promise<void>;

  // ---- Plugin CRUD ----

  /** Check whether a specific version of a plugin exists */
  versionExists(obs: Observable, org: string, name: string, version: string): Promise<boolean>;

  /** Insert a new plugin version. Must reject if version already exists. */
  insert(obs: Observable, entry: RegistryEntry): Promise<void>;

  /** Get a single plugin. Returns latest version when version is omitted. */
  get(obs: Observable, org: string, name: string, version?: string): Promise<RegistryEntry | null>;

  /** Delete a plugin -- a single version when specified, otherwise all versions. */
  delete(obs: Observable, org: string, name: string, version?: string): Promise<void>;

  // ---- Queries ----

  /** List plugins with optional filters and pagination. Returns latest version of each plugin. */
  list(obs: Observable, query: ListQuery): Promise<{ results: RegistryEntry[]; total: number }>;

  /** Full-text search across plugin metadata. Returns latest version of each match. */
  search(obs: Observable, query: SearchQuery): Promise<{ results: RegistryEntry[]; total: number }>;

  /** Get all versions of a plugin, optionally filtered to a major.minor. Sorted newest-first. */
  getVersions(obs: Observable, org: string, name: string, majorMinor?: string): Promise<VersionInfo[]>;

  /** Aggregate registry statistics. */
  getStats(obs: Observable): Promise<RegistryStats>;

  // ---- Organizations ----

  /** Get organization details (with live plugin count and members). */
  getOrganization(obs: Observable, orgId: string): Promise<Organization | null>;

  /** Create an organization if it does not already exist. Returns the org. */
  createOrganization(obs: Observable, orgId: string, displayName: string, visibility: 'public' | 'private'): Promise<Organization>;

  /** Add or update a member in an organization. */
  setOrgMember(obs: Observable, orgId: string, userId: string, permission: ResourcePermission): Promise<void>;

  /** Remove a member from an organization. */
  removeOrgMember(obs: Observable, orgId: string, userId: string): Promise<void>;

  /** Get the members list for an organization. Returns empty array if org not found. */
  getOrgMembers(obs: Observable, orgId: string): Promise<OrgMember[]>;

  // ---- Users ----

  /** Get a user by ID. Returns null if not found. */
  getUser(obs: Observable, userId: string): Promise<User | null>;

  /** Get a user by email address. Returns null if not found. */
  getUserByEmail(obs: Observable, email: string): Promise<User | null>;

  /** List all users. */
  listUsers(obs: Observable): Promise<User[]>;

  /** Insert a new user. Must reject if a user with the same ID already exists. */
  createUser(obs: Observable, user: User): Promise<void>;

  /** Update an existing user. Merges the provided fields. Returns the updated user or null if not found. */
  updateUser(obs: Observable, userId: string, updates: Partial<Pick<User, 'name' | 'email' | 'active' | 'permissions'>>): Promise<User | null>;

  // ---- Auth Tokens ----

  /** Get a token by its token string. Returns null if not found. */
  getToken(obs: Observable, tokenString: string): Promise<AuthToken | null>;

  /** Get all tokens belonging to a user. */
  getTokensForUser(obs: Observable, userId: string): Promise<AuthToken[]>;

  /** Insert a new token. */
  createToken(obs: Observable, token: AuthToken): Promise<void>;

  /** Delete a specific token by its token string. Returns true if deleted. */
  deleteToken(obs: Observable, tokenString: string): Promise<boolean>;

  /** Delete all tokens belonging to a user. Returns the number deleted. */
  deleteTokensForUser(obs: Observable, userId: string): Promise<number>;
}

export interface StorageConfig {
  type: 'file' | 'postgres';
  path: string;
}

/**
 * Create the appropriate RegistryDB implementation for the given config.
 */
export function createStorage(config: StorageConfig): RegistryDB {
  switch (config.type) {
    case 'file':
      return new FileDB(config.path);

    case 'postgres':
      throw new Error('PostgreSQL storage is not yet implemented');

    default:
      throw new Error(`Unknown database type: ${config.type}`);
  }
}
