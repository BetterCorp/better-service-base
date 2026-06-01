import * as av from 'anyvali'

const validCategories = ['observable', 'service', 'events', 'config']
const pluginIdPattern = `^(${validCategories.join('|')})-`

// Plugin category enum
const CategorySchema = av.enum_(validCategories)

// Plugin links schema
const LinksSchema = av.object({
  npm: av.optional(av.string().format('url')),
  github: av.optional(av.string().format('url')),
  website: av.optional(av.string().format('url'))
}, { unknownKeys: 'strip' })

// Individual plugin schema
const PluginSchema = av.object({
  id: av.string().minLength(1).pattern(pluginIdPattern),
  name: av.string().minLength(1),
  basePath: av.optional(av.string()).default('./'),
  description: av.string().minLength(1),
  tags: av.array(av.string()).default([]),
  image: av.optional(av.string()),
  documentation: av.array(av.string()).minItems(1),
  pluginPath: av.string().minLength(1),
  links: av.optional(LinksSchema)
}, { unknownKeys: 'strip' })

// Manifest schema (multi-language support)
const ManifestSchema = av.object({
  nodejs: av.optional(av.array(PluginSchema)),
  go: av.optional(av.array(PluginSchema)),
  python: av.optional(av.array(PluginSchema))
}, { unknownKeys: 'strip' })

export { PluginSchema, ManifestSchema, CategorySchema }
