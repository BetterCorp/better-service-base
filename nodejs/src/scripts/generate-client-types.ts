/**
 * BSB Virtual Client Generator
 *
 * Generates TypeScript virtual client files from exported schema JSON files.
 * These client files provide typed wrappers around the event bus, enabling
 * type-safe cross-plugin communication without direct source imports.
 *
 * Schema sources:
 *   1. Local build: lib/schemas/*.json (from this project's export-schemas)
 *   2. Remote install: src/.bsb/schemas/*.json (from bsb client install)
 *
 * Output:
 *   Writes TypeScript files to src/.bsb/clients/{plugin-name}.ts
 *
 * Generated clients use bsb.* builders to define BSBType schemas (same as
 * real plugins), then export inferred TypeScript types from those schemas.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventSchemaExport, JSONSchemaType, EventExportDefinition } from '../interfaces/schema-events';

/**
 * Convert JSON Schema to a bsb.* builder call string.
 * Reconstructs the BSBType builder expression from exported JSON Schema.
 */
function jsonSchemaToBsbCode(schema: JSONSchemaType): string {
  // Handle enum
  if (schema.enum) {
    const values = schema.enum.map((v: any) => JSON.stringify(v)).join(', ');
    const desc = schema.description ? `, ${JSON.stringify(schema.description)}` : '';
    return `bsb.enum([${values}]${desc})`;
  }

  // Handle oneOf (union types / void)
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    if (schema.oneOf.length === 0) {
      // void or unknown
      if (schema.description === 'void') {
        return 'bsb.void()';
      }
      return `bsb.unknown(${schema.description ? JSON.stringify(schema.description) : ''})`;
    }
    const types = schema.oneOf.map((s: any) => jsonSchemaToBsbCode(s as JSONSchemaType)).join(', ');
    const desc = schema.description ? `, ${JSON.stringify(schema.description)}` : '';
    return `bsb.union([${types}]${desc})`;
  }

  // Handle array type (can be string or string[])
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = types[0];

  switch (type) {
    case 'string': {
      // Check format for specialized types
      if (schema.format === 'uuid') {
        return `bsb.uuid(${schema.description ? JSON.stringify(schema.description) : ''})`;
      }
      if (schema.format === 'datetime') {
        return `bsb.datetime(${schema.description ? JSON.stringify(schema.description) : ''})`;
      }
      if (schema.format === 'email') {
        return `bsb.email(${schema.description ? JSON.stringify(schema.description) : ''})`;
      }
      if (schema.format === 'uri' || schema.format === 'url') {
        return `bsb.uri(${schema.description ? JSON.stringify(schema.description) : ''})`;
      }
      // Generic string
      const opts: string[] = [];
      if (schema.minLength !== undefined) opts.push(`min: ${schema.minLength}`);
      if (schema.maxLength !== undefined) opts.push(`max: ${schema.maxLength}`);
      if (schema.pattern) opts.push(`pattern: ${JSON.stringify(schema.pattern)}`);
      if (schema.description) opts.push(`description: ${JSON.stringify(schema.description)}`);
      if (opts.length === 0) return 'bsb.string()';
      return `bsb.string({ ${opts.join(', ')} })`;
    }

    case 'number':
    case 'integer': {
      const format = schema.format;
      const opts: string[] = [];
      if (schema.description) opts.push(`description: ${JSON.stringify(schema.description)}`);
      const optsStr = opts.length > 0 ? `{ ${opts.join(', ')} }` : '';

      if (format === 'int32') return `bsb.int32(${optsStr ? optsStr : ''})`;
      if (format === 'int64') return `bsb.int64(${optsStr ? optsStr : ''})`;
      if (format === 'float') return `bsb.float(${optsStr ? optsStr : ''})`;
      // Default: number (double)
      return `bsb.number(${optsStr ? optsStr : ''})`;
    }

    case 'boolean':
      return `bsb.boolean(${schema.description ? JSON.stringify(schema.description) : ''})`;

    case 'array': {
      const itemsCode = schema.items ? jsonSchemaToBsbCode(schema.items) : 'bsb.unknown()';
      const opts: string[] = [];
      if (schema.minItems !== undefined) opts.push(`min: ${schema.minItems}`);
      if (schema.maxItems !== undefined) opts.push(`max: ${schema.maxItems}`);
      if (schema.description) opts.push(`description: ${JSON.stringify(schema.description)}`);
      if (opts.length === 0) return `bsb.array(${itemsCode})`;
      return `bsb.array(${itemsCode}, { ${opts.join(', ')} })`;
    }

    case 'object': {
      if (!schema.properties || Object.keys(schema.properties).length === 0) {
        return `bsb.object({}, ${schema.description ? JSON.stringify(schema.description) : "''"})`;
      }

      const required = schema.required || [];
      const propLines: string[] = [];

      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const propCode = jsonSchemaToBsbCode(propSchema as JSONSchemaType);
        const isOptional = !required.includes(key);
        if (isOptional) {
          propLines.push(`    ${key}: optional(${propCode})`);
        } else {
          propLines.push(`    ${key}: ${propCode}`);
        }
      }

      const desc = schema.description ? `, ${JSON.stringify(schema.description)}` : '';
      return `bsb.object({\n${propLines.join(',\n')}\n  }${desc})`;
    }

    default:
      return 'bsb.unknown()';
  }
}

/**
 * Convert event name to camelCase method name.
 * e.g., 'todo.create' → 'todoCreate', 'todo-created' → 'todoCreated'
 */
function eventNameToMethodName(eventName: string): string {
  return eventName
    .replace(/[.-](\w)/g, (_, c) => c.toUpperCase());
}

/**
 * Convert plugin key/ID to PascalCase client class name.
 * Strip 'service-' prefix, remove non-alphanumeric chars, PascalCase, append 'Client'.
 * e.g., 'service-todo' → 'TodoClient', 'bsb-registry' → 'BsbRegistryClient'
 */
function pluginNameToClassName(pluginId: string): string {
  let name = pluginId;
  if (name.startsWith('service-')) {
    name = name.substring('service-'.length);
  }

  const pascal = name
    .replace(/[^a-zA-Z0-9-]/g, '')
    .split('-')
    .filter(part => part.length > 0)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return pascal + 'Client';
}

/**
 * Generate a const name from event name and role.
 * e.g., 'todo.create' + 'Input' → '_todoCreateInput'
 */
function eventNameToConstName(eventName: string, suffix: string): string {
  const camel = eventNameToMethodName(eventName);
  return '_' + camel + suffix;
}

/**
 * Flip mapping for client method generation.
 * Service's onReturnableEvents → client emits returnable events, etc.
 */
const FLIP_MAP: Record<string, string> = {
  'emitEvents': 'onEvents',
  'onEvents': 'emitEvents',
  'emitReturnableEvents': 'onReturnableEvents',
  'onReturnableEvents': 'emitReturnableEvents',
  'emitBroadcast': 'onBroadcast',
  'onBroadcast': 'emitBroadcast',
};

/**
 * Generate virtual client TypeScript file from exported schema.
 * @param pluginId The plugin key/ID (from schema filename), used for class naming
 */
function generateVirtualClient(schemaExport: EventSchemaExport, importBase: string, pluginId: string): string {
  const lines: string[] = [];
  const className = pluginNameToClassName(pluginId);

  // File header
  lines.push(`/**`);
  lines.push(` * Auto-generated BSB virtual client for ${schemaExport.pluginName}`);
  lines.push(` * DO NOT EDIT - Regenerated on every build`);
  lines.push(` * @version ${schemaExport.version}`);
  lines.push(` */`);
  // Import paths differ between @bsb/base (external) and self-build (relative)
  if (importBase === '@bsb/base') {
    lines.push(`import { ServiceClient, BSBService, bsb, optional } from "@bsb/base";`);
    lines.push(`import { createReturnableEvent, createFireAndForgetEvent, createBroadcastEvent, createEventSchemas } from "@bsb/base";`);
    lines.push(`import type { Observable, BSBServiceClientDefinition, EventInputType, EventOutputType } from "@bsb/base";`);
  } else {
    // Self-build: src/.bsb/clients/ → ../../index for the main barrel
    lines.push(`import { ServiceClient, BSBService, bsb, optional } from "../../index";`);
    lines.push(`import { createReturnableEvent, createFireAndForgetEvent, createBroadcastEvent, createEventSchemas } from "../../interfaces/schema-events";`);
    lines.push(`import type { Observable, BSBServiceClientDefinition, EventInputType, EventOutputType } from "../../index";`);
  }
  lines.push('');

  // Group events by category
  const categorizedEvents: Record<string, Array<{ name: string; def: EventExportDefinition }>> = {
    emitEvents: [],
    onEvents: [],
    emitReturnableEvents: [],
    onReturnableEvents: [],
    emitBroadcast: [],
    onBroadcast: [],
  };

  for (const [eventName, eventDef] of Object.entries(schemaExport.events)) {
    const def = eventDef as EventExportDefinition;
    if (categorizedEvents[def.category]) {
      categorizedEvents[def.category].push({ name: eventName, def });
    }
  }

  // --- Generate BSBType schema consts for each event's input/output ---
  const constsDone = new Set<string>();

  for (const events of Object.values(categorizedEvents)) {
    for (const { name, def } of events) {
      // Input const
      const inputConst = eventNameToConstName(name, 'Schema');
      if (!constsDone.has(inputConst)) {
        const bsbCode = jsonSchemaToBsbCode(def.inputSchema);
        lines.push(`const ${inputConst} = ${bsbCode};`);
        constsDone.add(inputConst);
      }

      // Output const (only for returnable events)
      if (def.type === 'returnable' && def.outputSchema) {
        const outputConst = eventNameToConstName(name, 'OutputSchema');
        if (!constsDone.has(outputConst)) {
          const bsbCode = jsonSchemaToBsbCode(def.outputSchema);
          lines.push(`const ${outputConst} = ${bsbCode};`);
          constsDone.add(outputConst);
        }
      }
    }
  }

  if (constsDone.size > 0) {
    lines.push('');
  }

  // --- Generate Event Schemas using createEventSchemas ---
  lines.push(`// --- Event Schemas (typed, follows ServiceClientEventSchemas flip) ---`);
  lines.push(`const _EventSchemas = createEventSchemas({`);

  for (const [category, events] of Object.entries(categorizedEvents)) {
    if (events.length === 0) continue;

    lines.push(`  ${category}: {`);

    for (const { name, def } of events) {
      const inputConst = eventNameToConstName(name, 'Schema');
      const desc = def.description ? JSON.stringify(def.description) : undefined;

      if (def.type === 'returnable') {
        const outputConst = eventNameToConstName(name, 'OutputSchema');
        const descArg = desc ? `, ${desc}` : '';
        const timeoutArg = def.defaultTimeout !== undefined ? `, ${def.defaultTimeout}` : '';
        // If we have timeout but no desc, we need desc placeholder
        if (def.defaultTimeout !== undefined && !desc) {
          lines.push(`    '${name}': createReturnableEvent(${inputConst}, ${outputConst}, undefined, ${def.defaultTimeout}),`);
        } else {
          lines.push(`    '${name}': createReturnableEvent(${inputConst}, ${outputConst}${descArg}${timeoutArg}),`);
        }
      } else if (def.type === 'broadcast') {
        const descArg = desc ? `, ${desc}` : '';
        lines.push(`    '${name}': createBroadcastEvent(${inputConst}${descArg}),`);
      } else {
        const descArg = desc ? `, ${desc}` : '';
        lines.push(`    '${name}': createFireAndForgetEvent(${inputConst}${descArg}),`);
      }
    }

    lines.push(`  },`);
  }

  lines.push(`});`);
  lines.push('');

  // --- Export inferred types ---
  lines.push(`// --- Exported Types (inferred from BSBType schemas) ---`);
  const typesDone = new Set<string>();
  for (const events of Object.values(categorizedEvents)) {
    for (const { name, def } of events) {
      const camel = eventNameToMethodName(name);
      const typeName = camel.charAt(0).toUpperCase() + camel.slice(1);

      // Input type
      const inputTypeName = typeName + 'Input';
      if (!typesDone.has(inputTypeName)) {
        const inputConst = eventNameToConstName(name, 'Schema');
        lines.push(`export type ${inputTypeName} = EventInputType<{ input: typeof ${inputConst} }>;`);
        typesDone.add(inputTypeName);
      }

      // Output type (returnable only)
      if (def.type === 'returnable' && def.outputSchema) {
        const outputTypeName = typeName + 'Output';
        if (!typesDone.has(outputTypeName)) {
          const outputConst = eventNameToConstName(name, 'OutputSchema');
          lines.push(`export type ${outputTypeName} = EventOutputType<{ output: typeof ${outputConst} }>;`);
          typesDone.add(outputTypeName);
        }
      }
    }
  }
  lines.push('');

  // --- Internal Plugin Reference ---
  lines.push(`// --- Internal: Plugin reference for ServiceClient wiring ---`);
  lines.push(`const _PLUGIN_CLIENT: BSBServiceClientDefinition = {`);
  lines.push(`  name: "${pluginId}",`);
  lines.push(`};`);
  lines.push('');
  lines.push(`class _PluginRef {`);
  lines.push(`  static PLUGIN_CLIENT = _PLUGIN_CLIENT;`);
  lines.push(`}`);
  lines.push('');

  // --- Exported Client Class ---
  lines.push(`// --- Exported Client ---`);
  lines.push(`export default class ${className} extends ServiceClient<any, typeof _EventSchemas, typeof _PluginRef> {`);
  lines.push(`  constructor(context: BSBService) {`);
  lines.push(`    super(_PluginRef, context);`);
  lines.push(`  }`);

  // Generate methods for each event (flip categories for client perspective)
  for (const [category, events] of Object.entries(categorizedEvents)) {
    if (events.length === 0) continue;

    const clientCategory = FLIP_MAP[category];
    if (!clientCategory) continue;

    for (const { name, def } of events) {
      const methodName = eventNameToMethodName(name);
      const camel = eventNameToMethodName(name);
      const typeName = camel.charAt(0).toUpperCase() + camel.slice(1);
      const inputTypeName = typeName + 'Input';
      const description = def.description || name;

      lines.push('');

      switch (clientCategory) {
        case 'emitEvents': {
          lines.push(`  /** ${description} */`);
          lines.push(`  async ${methodName}(obs: Observable, input: ${inputTypeName}): Promise<void> {`);
          lines.push(`    await this.events.emitEvent("${name}", obs, input);`);
          lines.push(`  }`);
          break;
        }

        case 'emitReturnableEvents': {
          const outputTypeName = typeName + 'Output';
          const timeout = def.defaultTimeout ?? 5;
          lines.push(`  /** ${description} (default timeout: ${timeout}s) */`);
          lines.push(`  async ${methodName}(obs: Observable, input: ${inputTypeName}, timeout: number = ${timeout}): Promise<${outputTypeName}> {`);
          lines.push(`    return this.events.emitEventAndReturn("${name}", obs, input, timeout);`);
          lines.push(`  }`);
          break;
        }

        case 'emitBroadcast': {
          const emitMethodName = 'emit' + methodName.charAt(0).toUpperCase() + methodName.slice(1);
          lines.push(`  /** ${description} */`);
          lines.push(`  async ${emitMethodName}(obs: Observable, input: ${inputTypeName}): Promise<void> {`);
          lines.push(`    await this.events.emitBroadcast("${name}", obs, input);`);
          lines.push(`  }`);
          break;
        }

        case 'onEvents': {
          const onMethodName = 'on' + methodName.charAt(0).toUpperCase() + methodName.slice(1);
          lines.push(`  /** ${description} */`);
          lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<void>): Promise<void> {`);
          lines.push(`    await this.events.onEvent("${name}", obs, handler);`);
          lines.push(`  }`);
          break;
        }

        case 'onReturnableEvents': {
          const outputTypeName = typeName + 'Output';
          const onMethodName = 'on' + methodName.charAt(0).toUpperCase() + methodName.slice(1);
          lines.push(`  /** ${description} */`);
          lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<${outputTypeName}>): Promise<void> {`);
          lines.push(`    await this.events.onReturnableEvent("${name}", obs, handler);`);
          lines.push(`  }`);
          break;
        }

        case 'onBroadcast': {
          const onMethodName = 'on' + methodName.charAt(0).toUpperCase() + methodName.slice(1);
          lines.push(`  /** ${description} */`);
          lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<void>): Promise<void> {`);
          lines.push(`    await this.events.onBroadcast("${name}", obs, handler);`);
          lines.push(`  }`);
          break;
        }
      }
    }
  }

  lines.push(`}`);
  lines.push(`export { ${className} };`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Process schema files from a directory and generate virtual clients.
 */
function processSchemaDirectory(
  schemasDir: string,
  clientsDir: string,
  importBase: string,
  skipPlugins?: Set<string>
): { generated: number; errors: number } {
  let generated = 0;
  let errors = 0;

  if (!fs.existsSync(schemasDir)) {
    return { generated, errors };
  }

  const schemaFiles = fs.readdirSync(schemasDir)
    .filter(file => file.endsWith('.json') && !file.endsWith('.plugin.json'));

  for (const schemaFile of schemaFiles) {
    try {
      const pluginId = path.basename(schemaFile, '.json');

      // Skip if already processed from a higher-priority source
      if (skipPlugins && skipPlugins.has(pluginId)) {
        continue;
      }

      const schemaPath = path.join(schemasDir, schemaFile);
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      const schemaExport: EventSchemaExport = JSON.parse(schemaContent);

      // Skip schemas with no events
      if (!schemaExport.events || Object.keys(schemaExport.events).length === 0) {
        continue;
      }

      // Generate virtual client (use pluginId from filename, not pluginName from schema)
      const clientCode = generateVirtualClient(schemaExport, importBase, pluginId);

      // Write to file
      const outputPath = path.join(clientsDir, `${pluginId}.ts`);
      fs.writeFileSync(outputPath, clientCode, 'utf-8');

      // eslint-disable-next-line no-console
      console.log(`  Generated virtual client for ${pluginId} (v${schemaExport.version})`);
      generated++;
    } catch (error) {
      errors++;
      // eslint-disable-next-line no-console
      console.error(`  Error generating client for ${schemaFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { generated, errors };
}

/**
 * Ensure the project's .gitignore contains the src/.bsb/ entry.
 * Automatically adds it if missing, so generated virtual clients
 * are never accidentally committed.
 */
function ensureGitignore(projectRoot: string): void {
  const gitignorePath = path.join(projectRoot, '.gitignore');

  const bsbDir = path.join(projectRoot, 'src', '.bsb');
  let relativeBsbDir = path.relative(projectRoot, bsbDir).replace(/\\/g, '/');
  if (!relativeBsbDir.endsWith('/')) {
    relativeBsbDir += '/';
  }

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = content.split(/\r?\n/);

      const alreadyIgnored = lines.some(line => {
        const trimmed = line.trim();
        return trimmed === relativeBsbDir ||
          trimmed === relativeBsbDir.replace(/\/$/, '') ||
          trimmed === '.bsb/' ||
          trimmed === '.bsb' ||
          trimmed === 'src/.bsb/' ||
          trimmed === 'src/.bsb';
      });

      if (!alreadyIgnored) {
        const newline = content.endsWith('\n') ? '' : '\n';
        fs.writeFileSync(gitignorePath, content + newline + relativeBsbDir + '\n', 'utf-8');
        // eslint-disable-next-line no-console
        console.log(`  Added '${relativeBsbDir}' to .gitignore`);
      }
    } else {
      fs.writeFileSync(gitignorePath, relativeBsbDir + '\n', 'utf-8');
      // eslint-disable-next-line no-console
      console.log(`  Created .gitignore with '${relativeBsbDir}'`);
    }
  } catch {
    // Non-fatal: don't fail the build if we can't update .gitignore
  }
}

/**
 * Main generation function.
 */
async function main() {
  const projectRoot = process.cwd();

  // Detect if we're in @bsb/base itself or a plugin project
  const packageJsonPath = path.join(projectRoot, 'package.json');
  let importBase = '@bsb/base';

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name === '@bsb/base') {
        importBase = '../../base';
      }
    } catch {
      // ignore parse errors
    }
  }

  // Create output directory
  const clientsDir = path.join(projectRoot, 'src', '.bsb', 'clients');
  if (!fs.existsSync(clientsDir)) {
    fs.mkdirSync(clientsDir, { recursive: true });
  }

  // Ensure .gitignore covers the generated directory
  ensureGitignore(projectRoot);

  let totalGenerated = 0;
  let totalErrors = 0;

  // Schema source: src/.bsb/schemas/*.json
  // These are extracted from TS source pre-compilation, or installed via `bsb client install`
  const bsbSchemasDir = path.join(projectRoot, 'src', '.bsb', 'schemas');

  if (fs.existsSync(bsbSchemasDir)) {
    // eslint-disable-next-line no-console
    console.log('Processing schemas...');
    const { generated, errors } = processSchemaDirectory(bsbSchemasDir, clientsDir, importBase);
    totalGenerated += generated;
    totalErrors += errors;
  }

  if (totalGenerated === 0 && totalErrors === 0) {
    // eslint-disable-next-line no-console
    console.log('No schema files found to generate clients from.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`\nClient generation complete: ${totalGenerated} generated, ${totalErrors} errors`);
  // eslint-disable-next-line no-console
  console.log(`Clients written to: ${clientsDir}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during client generation:', error);
    process.exit(1);
  });
}

export { main as generateClientTypes };
