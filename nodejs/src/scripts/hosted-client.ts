import { createHash } from 'node:crypto';
import { normalizePluginLanguage } from '../interfaces/plugin-language.js';
import { parseRegistryPluginId } from '../interfaces/registry-identifiers.js';
import type { EventSchemaExport } from '../interfaces/schema-events.js';
import { importPortableSchema } from '../interfaces/schema-types.js';
import { assertSafeSchemaDocument } from '../interfaces/schema-safety.js';

// SemVer 2.0.0 identifiers; (?![\s\S]) requires the actual end, including for line terminators.
const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\s\S])/;
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);

async function getJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Hosted discovery returned HTTP ${response.status}`); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty hosted discovery response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) throw new Error('Hosted JSON exceeds 4 MiB');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function hostedSchema(endpoint: string, options: { plugin?: string; language?: string; version?: string; allowInsecure?: boolean } = {}): Promise<{ schema: EventSchemaExport; localName: string }> {
  const base = new URL(endpoint);
  if ((base.protocol !== 'https:' && !(options.allowInsecure && base.protocol === 'http:')) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Hosted service requires an HTTPS origin without credentials, paths, query or fragment');
  }
  const discovery = new URL('/.well-known/bsb', base);
  const manifest = await getJson(discovery);
  if (!object(manifest) || manifest.bsb !== 1 || !Array.isArray(manifest.plugins) || !manifest.plugins.length || manifest.plugins.length > 128) throw new Error('Invalid BSB discovery document');
  const selected = options.plugin ? parseRegistryPluginId(options.plugin) : undefined;
  const language = options.language ? normalizePluginLanguage(options.language) : undefined;
  if (options.version !== undefined && !versionPattern.test(options.version)) throw new Error('An exact semantic version is required');
  const identities = new Set<string>();
  const candidates = manifest.plugins.map((entry: unknown) => {
    if (!object(entry) || typeof entry.id !== 'string' || typeof entry.language !== 'string' || typeof entry.version !== 'string' || !versionPattern.test(entry.version) || !(object(entry.schema) || typeof entry.schema === 'string')) throw new Error('Invalid hosted plugin metadata');
    const { org, name } = parseRegistryPluginId(entry.id);
    const implementation = normalizePluginLanguage(entry.language);
    const identity = `${org}/${name}~${implementation}~${entry.version}`;
    if (identities.has(identity)) throw new Error('Duplicate hosted implementation');
    identities.add(identity);
    return { entry, org, name, language: implementation };
  }).filter(value => (!selected || (value.org === selected.org && value.name === selected.name)) && (!language || value.language === language) && (!options.version || value.entry.version === options.version));
  if (candidates.length !== 1) throw new Error('No unique hosted implementation; specify --plugin, --source-language or --version');
  const candidate = candidates[0];
  let schema: unknown = candidate.entry.schema;
  if (typeof schema === 'string') {
    const link = new URL(schema, discovery);
    if (link.origin !== base.origin || link.username || link.password || link.hash) throw new Error('Hosted schema link must remain on the same origin without credentials or fragments');
    schema = await getJson(link);
  }
  if (!object(schema) || !object(schema.events)) throw new Error('Hosted schema must contain an events object');
  assertSafeSchemaDocument(schema);
  const categories: Record<string, string> = { onEvents: 'fire-and-forget', emitEvents: 'fire-and-forget', onReturnableEvents: 'returnable', emitReturnableEvents: 'returnable', onBroadcast: 'broadcast', emitBroadcast: 'broadcast' };
  for (const event of Object.values(schema.events)) {
    if (!object(event) || typeof event.category !== 'string' || !Object.hasOwn(categories, event.category) || categories[event.category] !== event.type) throw new Error('Invalid hosted event type/category');
    for (const document of event.type === 'returnable' ? [event.inputSchema, event.outputSchema] : [event.inputSchema]) {
      if (!object(document) || !object(document.root)) throw new Error('Hosted events require complete AnyVali documents');
      importPortableSchema(document as any);
    }
  }
  if (schema.version !== undefined && schema.version !== candidate.entry.version) throw new Error('Hosted schema version does not match discovery');
  const target = schema.pluginId ?? schema.pluginName ?? candidate.name;
  if (typeof target !== 'string' || parseRegistryPluginId(target).name !== target) throw new Error('Invalid hosted wire plugin ID');
  const source = { url: base.origin, org: candidate.org, name: candidate.name, language: candidate.language, version: candidate.entry.version };
  const localName = `hosted~${createHash('sha256').update(base.origin).digest('hex').slice(0, 16)}~${source.org}~${source.name}~${source.language}`;
  return { schema: { ...schema, pluginId: target, pluginName: schema.pluginName ?? target, events: schema.events, version: source.version, source } as EventSchemaExport, localName };
}
