import { z } from 'zod'

// Plugin category enum
const CategorySchema = z.enum([
  'observable',
  'service',
  'events',
  'config'
])

// Plugin links schema
const LinksSchema = z.object({
  npm: z.string().url().optional(),
  github: z.string().url().optional(),
  website: z.string().url().optional()
})

// Valid category prefixes
const validCategories = ['observable', 'service', 'events', 'config']

// Individual plugin schema
const PluginSchema = z.object({
  id: z.string()
    .min(1)
    .refine(
      (id) => {
        const category = id.split('-')[0]
        return validCategories.includes(category)
      },
      (id) => ({
        message: `Plugin ID "${id}" must start with one of: ${validCategories.join(', ')} (e.g., "observable-syslog")`
      })
    ), // Technical plugin identifier (e.g., "observable-syslog")
  name: z.string().min(1), // Human-readable display name (e.g., "Syslog Client")
  basePath: z.string().default('./'),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  image: z.string().optional(),
  documentation: z.array(z.string()).min(1),
  pluginPath: z.string().min(1),
  links: LinksSchema.optional()
  // Auto-detected/pulled from other sources:
  // - category: extracted from plugin id prefix (observable-, service-, events-, config-)
  // - version: from package.json
  // - package: from package.json
  // - official: based on plugin location (in official repo or not)
  // - links.npm: from package.json name
})

// Manifest schema (multi-language support)
const ManifestSchema = z.object({
  nodejs: z.array(PluginSchema).optional(),
  go: z.array(PluginSchema).optional(),
  python: z.array(PluginSchema).optional()
})

export { PluginSchema, ManifestSchema, CategorySchema }
