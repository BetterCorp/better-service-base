import { bsb, optional, nullable, InferBSBType } from '@bsb/base';

// ========================================
// Registry Entry Schema (Main Data Model)
// ========================================

const PackageInfo = bsb.object({
  nodejs: optional(bsb.string({ description: 'NPM package name' })),
  csharp: optional(bsb.string({ description: 'NuGet package name' })),
  go: optional(bsb.string({ description: 'Go module path' })),
  java: optional(bsb.string({ description: 'Maven coordinates' })),
  python: optional(bsb.string({ description: 'PyPI package name' })),
}, 'Language-specific package information');

const RuntimeRequirements = bsb.object({
  nodejs: optional(bsb.string({ description: 'Node.js version requirement' })),
  dotnet: optional(bsb.string({ description: '.NET version requirement' })),
  go: optional(bsb.string({ description: 'Go version requirement' })),
  java: optional(bsb.string({ description: 'Java version requirement' })),
  python: optional(bsb.string({ description: 'Python version requirement' })),
}, 'Runtime version requirements');

const TypeDefinitions = bsb.object({
  nodejs: optional(bsb.string({ description: 'TypeScript .d.ts definitions' })),
  csharp: optional(bsb.string({ description: 'C# interface definitions' })),
  go: optional(bsb.string({ description: 'Go type definitions' })),
  java: optional(bsb.string({ description: 'Java interface definitions' })),
}, 'Language-specific type definitions');

const Documentation = bsb.object({
  readme: bsb.string({ description: 'README.md content (markdown)' }),
  changelog: optional(bsb.string({ description: 'CHANGELOG.md content' })),
  fullDocs: optional(bsb.string({ description: 'Full docs directory as JSON string' })),
  apiReference: optional(bsb.string({ description: 'Auto-generated API reference as JSON string' })),
}, 'Plugin documentation');

export const RegistryEntrySchema = bsb.object({
  // Identity (Docker-style: org/plugin-name)
  id: bsb.string({ min: 1, max: 200, description: 'Full ID: org/plugin-name' }),
  org: bsb.string({ min: 1, max: 100, description: 'Organization or user name' }),
  name: bsb.string({ min: 1, max: 100, description: 'Plugin name' }),
  displayName: bsb.string({ min: 1, max: 200, description: 'Human-readable name' }),
  description: bsb.string({ min: 1, max: 1000, description: 'Short description' }),

  // Version & Language
  version: bsb.string({ min: 1, max: 50, description: 'Semantic version (1.0.0)' }),
  majorMinor: bsb.string({ min: 1, max: 20, description: 'Major.minor only (1.0)' }),
  language: bsb.enum(['nodejs', 'csharp', 'go', 'java', 'python'], 'Programming language'),

  // Language-specific package info
  package: optional(PackageInfo),

  // Classification
  category: bsb.enum(['service', 'observable', 'events', 'config', 'other'], 'Plugin category'),
  tags: bsb.array(bsb.string({ max: 50 }), { description: 'Searchable keywords' }),

  // Optional metadata
  author: optional(bsb.string({ max: 200, description: 'Author name' })),
  license: optional(bsb.string({ max: 50, description: 'License identifier' })),
  homepage: optional(bsb.uri('Documentation URL')),
  repository: optional(bsb.uri('Source repository URL')),

  // Access control
  visibility: bsb.enum(['public', 'private'], 'Visibility level'),
  orgId: bsb.string({ min: 1, max: 100, description: 'Organization ID for access control' }),

  // Full schemas (stored as JSON string)
  eventSchema: bsb.string({ description: 'Full EventSchemaExport JSON' }),
  typeDefinitions: optional(TypeDefinitions),

  // Documentation
  documentation: optional(Documentation),

  // Event statistics
  eventCount: bsb.int32({ min: 0, description: 'Total event count' }),
  emitEventCount: bsb.int32({ min: 0, description: 'Fire-and-forget emit events' }),
  onEventCount: bsb.int32({ min: 0, description: 'Fire-and-forget on events' }),
  returnableEventCount: bsb.int32({ min: 0, description: 'Returnable events' }),
  broadcastEventCount: bsb.int32({ min: 0, description: 'Broadcast events' }),

  // Publishing metadata
  publishedBy: bsb.string({ max: 200, description: 'User ID who published' }),
  publishedAt: bsb.datetime('First publish timestamp'),
  updatedAt: bsb.datetime('Last update timestamp'),
  downloads: optional(bsb.int32({ min: 0, description: 'Download count' })),

  // Runtime requirements
  runtime: optional(RuntimeRequirements),
}, 'Registry entry for a plugin');

export type RegistryEntry = InferBSBType<typeof RegistryEntrySchema>;

// ========================================
// API Request/Response Schemas
// ========================================

export const ListQuerySchema = bsb.object({
  org: optional(bsb.string({ max: 100, description: 'Filter by organization' })),
  language: optional(bsb.enum(['nodejs', 'csharp', 'go', 'java', 'python'], 'Filter by language')),
  category: optional(bsb.enum(['service', 'observable', 'events', 'config', 'other'], 'Filter by category')),
  limit: optional(bsb.int32({ min: 1, max: 100, description: 'Results per page (default: 50)' })),
  offset: optional(bsb.int32({ min: 0, description: 'Pagination offset (default: 0)' })),
}, 'Query parameters for listing plugins');

export type ListQuery = InferBSBType<typeof ListQuerySchema>;

export const SearchQuerySchema = bsb.object({
  query: bsb.string({ min: 1, max: 200, description: 'Search query string' }),
  language: optional(bsb.enum(['nodejs', 'csharp', 'go', 'java', 'python'], 'Filter by language')),
  category: optional(bsb.enum(['service', 'observable', 'events', 'config', 'other'], 'Filter by category')),
  limit: optional(bsb.int32({ min: 1, max: 100, description: 'Results per page (default: 20)' })),
  offset: optional(bsb.int32({ min: 0, description: 'Pagination offset (default: 0)' })),
}, 'Query parameters for searching plugins');

export type SearchQuery = InferBSBType<typeof SearchQuerySchema>;

export const PublishRequestSchema = bsb.object({
  org: bsb.string({ min: 1, max: 100, description: 'Organization name' }),
  name: bsb.string({ min: 1, max: 100, description: 'Plugin name' }),
  version: bsb.string({ min: 1, max: 50, description: 'Semantic version' }),
  language: bsb.enum(['nodejs', 'csharp', 'go', 'java', 'python'], 'Programming language'),
  metadata: bsb.object({
    displayName: bsb.string({ min: 1, max: 200, description: 'Human-readable name' }),
    description: bsb.string({ min: 1, max: 1000, description: 'Short description' }),
    category: bsb.enum(['service', 'observable', 'events', 'config', 'other'], 'Plugin category'),
    tags: bsb.array(bsb.string({ max: 50 }), { description: 'Searchable keywords' }),
    author: optional(bsb.string({ max: 200 })),
    license: optional(bsb.string({ max: 50 })),
    homepage: optional(bsb.uri()),
    repository: optional(bsb.uri()),
  }, 'Plugin metadata'),
  eventSchema: bsb.string({ description: 'Full EventSchemaExport JSON string' }),
  typeDefinitions: optional(TypeDefinitions),
  documentation: optional(Documentation),
  package: optional(PackageInfo),
  runtime: optional(RuntimeRequirements),
  visibility: optional(bsb.enum(['public', 'private'], 'Visibility level (default: public)')),
}, 'Request body for publishing a plugin');

export type PublishRequest = InferBSBType<typeof PublishRequestSchema>;

export const SearchResultsSchema = bsb.object({
  results: bsb.array(RegistryEntrySchema, { description: 'Matching plugins' }),
  total: bsb.int32({ min: 0, description: 'Total result count' }),
  query: bsb.string({ description: 'Search query used' }),
}, 'Search results response');

export type SearchResults = InferBSBType<typeof SearchResultsSchema>;

export const ListResultsSchema = bsb.object({
  results: bsb.array(RegistryEntrySchema, { description: 'Plugin list' }),
  total: bsb.int32({ min: 0, description: 'Total count' }),
  page: bsb.int32({ min: 1, description: 'Current page number' }),
}, 'List results response');

export type ListResults = InferBSBType<typeof ListResultsSchema>;

export const PublishResponseSchema = bsb.object({
  success: bsb.boolean('Operation success status'),
  pluginId: bsb.string({ description: 'Full plugin ID (org/name)' }),
  version: bsb.string({ description: 'Published version' }),
  message: optional(bsb.string({ description: 'Success or error message' })),
}, 'Response for publish operation');

export type PublishResponse = InferBSBType<typeof PublishResponseSchema>;

export const VersionInfo = bsb.object({
  version: bsb.string({ description: 'Full semantic version' }),
  majorMinor: bsb.string({ description: 'Major.minor version' }),
  publishedAt: bsb.datetime('Publication timestamp'),
}, 'Version information');

export type VersionInfo = InferBSBType<typeof VersionInfo>;

export const VersionListSchema = bsb.object({
  versions: bsb.array(VersionInfo, { description: 'All available versions' }),
  latest: bsb.string({ description: 'Latest version' }),
  latestForMajorMinor: bsb.string({ description: 'JSON map of major.minor to latest patch' }),
}, 'Version list response');

export type VersionList = InferBSBType<typeof VersionListSchema>;

export const VersionMatchSchema = bsb.object({
  requested: bsb.string({ description: 'Requested version (major.minor)' }),
  matched: bsb.string({ description: 'Matched full version' }),
  latest: bsb.string({ description: 'Latest available version' }),
  alert: optional(bsb.string({ description: 'Alert message if newer version available' })),
}, 'Version match response');

export type VersionMatch = InferBSBType<typeof VersionMatchSchema>;

export const RegistryStatsSchema = bsb.object({
  totalPlugins: bsb.int32({ min: 0, description: 'Total plugin count' }),
  byLanguage: bsb.string({ description: 'JSON map of language to count' }),
  byCategory: bsb.string({ description: 'JSON map of category to count' }),
  totalDownloads: bsb.int32({ min: 0, description: 'Total downloads across all plugins' }),
}, 'Registry statistics');

export type RegistryStats = InferBSBType<typeof RegistryStatsSchema>;

export const OrganizationSchema = bsb.object({
  id: bsb.string({ min: 1, max: 100, description: 'Organization ID' }),
  name: bsb.string({ min: 1, max: 100, description: 'Organization name' }),
  displayName: bsb.string({ min: 1, max: 200, description: 'Display name' }),
  pluginCount: bsb.int32({ min: 0, description: 'Number of plugins' }),
  visibility: bsb.enum(['public', 'private'], 'Default visibility'),
}, 'Organization information');

export type Organization = InferBSBType<typeof OrganizationSchema>;

export const ErrorResponseSchema = bsb.object({
  error: bsb.string({ description: 'Error message' }),
  code: optional(bsb.string({ description: 'Error code' })),
  details: optional(bsb.string({ description: 'Additional error details' })),
}, 'Error response');

export type ErrorResponse = InferBSBType<typeof ErrorResponseSchema>;

export const HealthResponseSchema = bsb.object({
  status: bsb.string({ description: 'Health status (ok/degraded/down)' }),
  uptime: bsb.int32({ min: 0, description: 'Uptime in seconds' }),
  version: bsb.string({ description: 'Registry version' }),
}, 'Health check response');

export type HealthResponse = InferBSBType<typeof HealthResponseSchema>;
