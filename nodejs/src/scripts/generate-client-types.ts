/**
 * BSB Virtual Client Generator
 *
 * Generates TypeScript virtual client files from exported AnyVali schema documents.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventSchemaExport, EventExportDefinition } from '../interfaces/schema-events.js';
import { isMainModule } from '../base/module-runtime.js';

/**
 * Convert an AnyVali schema node to BSBType builder code.
 * Produces typed calls like `bsb.object({...})` instead of untyped `av.importSchema()`.
 */
function schemaNodeToCode(node: Record<string, any>): string {
  const kind: string = node.kind;

  switch (kind) {
    case 'string': {
      if (node.format === 'uuid') return 'bsb.uuid()';
      if (node.format === 'date-time') return 'bsb.datetime()';
      if (node.format === 'email') return 'bsb.email()';
      if (node.format === 'url') return 'bsb.uri()';
      const opts: string[] = [];
      if (node.minLength !== undefined) opts.push(`min: ${node.minLength}`);
      if (node.maxLength !== undefined) opts.push(`max: ${node.maxLength}`);
      if (node.pattern !== undefined) opts.push(`pattern: ${JSON.stringify(node.pattern)}`);
      return opts.length > 0 ? `bsb.string({ ${opts.join(', ')} })` : 'bsb.string()';
    }

    case 'int32': {
      const opts: string[] = [];
      if (node.min !== undefined) opts.push(`min: ${node.min}`);
      if (node.max !== undefined) opts.push(`max: ${node.max}`);
      return opts.length > 0 ? `bsb.int32({ ${opts.join(', ')} })` : 'bsb.int32()';
    }

    case 'int64': {
      const opts: string[] = [];
      if (node.min !== undefined) opts.push(`min: ${node.min}`);
      if (node.max !== undefined) opts.push(`max: ${node.max}`);
      return opts.length > 0 ? `bsb.int64({ ${opts.join(', ')} })` : 'bsb.int64()';
    }

    case 'float32': {
      const opts: string[] = [];
      if (node.min !== undefined) opts.push(`min: ${node.min}`);
      if (node.max !== undefined) opts.push(`max: ${node.max}`);
      return opts.length > 0 ? `bsb.float({ ${opts.join(', ')} })` : 'bsb.float()';
    }

    case 'float64': {
      const opts: string[] = [];
      if (node.min !== undefined) opts.push(`min: ${node.min}`);
      if (node.max !== undefined) opts.push(`max: ${node.max}`);
      return opts.length > 0 ? `bsb.double({ ${opts.join(', ')} })` : 'bsb.double()';
    }

    case 'number': {
      const opts: string[] = [];
      if (node.min !== undefined) opts.push(`min: ${node.min}`);
      if (node.max !== undefined) opts.push(`max: ${node.max}`);
      return opts.length > 0 ? `bsb.number({ ${opts.join(', ')} })` : 'bsb.number()';
    }

    case 'bool':
      return 'bsb.boolean()';

    case 'null':
      return 'bsb.unknown()';

    case 'unknown':
      return 'bsb.unknown()';

    case 'enum':
      return `bsb.enum(${JSON.stringify(node.values)})`;

    case 'array': {
      const itemsCode = schemaNodeToCode(node.items);
      const opts: string[] = [];
      if (node.minItems !== undefined) opts.push(`min: ${node.minItems}`);
      if (node.maxItems !== undefined) opts.push(`max: ${node.maxItems}`);
      return opts.length > 0
        ? `bsb.array(${itemsCode}, { ${opts.join(', ')} })`
        : `bsb.array(${itemsCode})`;
    }

    case 'object': {
      const props = node.properties as Record<string, any> | undefined;
      if (!props || Object.keys(props).length === 0) {
        return 'bsb.object({})';
      }
      const required = new Set<string>(node.required || []);
      const entries = Object.entries(props).map(([key, value]) => {
        const code = schemaNodeToCode(value as Record<string, any>);
        // Non-required fields that aren't already optional get wrapped
        if (!required.has(key) && (value as Record<string, any>).kind !== 'optional') {
          return `${JSON.stringify(key)}: optional(${code})`;
        }
        return `${JSON.stringify(key)}: ${code}`;
      });
      return `bsb.object({\n    ${entries.join(',\n    ')}\n  })`;
    }

    case 'optional':
      return `optional(${schemaNodeToCode(node.inner)})`;

    case 'nullable':
      return `nullable(${schemaNodeToCode(node.inner)})`;

    case 'union': {
      const variants = (node.variants as any[]).map((v: any) => schemaNodeToCode(v));
      return `bsb.union([${variants.join(', ')}])`;
    }

    case 'record': {
      const valueCode = schemaNodeToCode(node.values);
      return `bsb.record(bsb.string(), ${valueCode})`;
    }

    default:
      // Fallback for any unhandled kind
      return 'bsb.unknown()';
  }
}

function jsonSchemaNodeToCode(node: Record<string, any>): string {
  const type = node.type;
  switch (type) {
    case 'string': {
      if (node.format === 'uuid') return 'bsb.uuid()';
      if (node.format === 'date-time') return 'bsb.datetime()';
      if (node.format === 'email') return 'bsb.email()';
      if (node.format === 'url' || node.format === 'uri') return 'bsb.uri()';
      const opts: string[] = [];
      if (node.minLength !== undefined) opts.push(`min: ${node.minLength}`);
      if (node.maxLength !== undefined) opts.push(`max: ${node.maxLength}`);
      if (node.pattern !== undefined) opts.push(`pattern: ${JSON.stringify(node.pattern)}`);
      return opts.length > 0 ? `bsb.string({ ${opts.join(', ')} })` : 'bsb.string()';
    }
    case 'integer':
    case 'number': {
      const fn = type === 'integer' ? 'int32' : 'number';
      const opts: string[] = [];
      if (node.minimum !== undefined) opts.push(`min: ${node.minimum}`);
      if (node.maximum !== undefined) opts.push(`max: ${node.maximum}`);
      return opts.length > 0 ? `bsb.${fn}({ ${opts.join(', ')} })` : `bsb.${fn}()`;
    }
    case 'boolean':
      return 'bsb.boolean()';
    case 'array': {
      const itemsCode = node.items ? jsonSchemaNodeToCode(node.items) : 'bsb.unknown()';
      return `bsb.array(${itemsCode})`;
    }
    case 'object': {
      const props = node.properties as Record<string, any> | undefined;
      if (!props || Object.keys(props).length === 0) return 'bsb.object({})';
      const required = new Set<string>(node.required || []);
      const entries = Object.entries(props).map(([key, value]) => {
        const code = jsonSchemaNodeToCode(value as Record<string, any>);
        return required.has(key) ? `${JSON.stringify(key)}: ${code}` : `${JSON.stringify(key)}: optional(${code})`;
      });
      return `bsb.object({\n    ${entries.join(',\n    ')}\n  })`;
    }
    default:
      return 'bsb.unknown()';
  }
}

function anyValiDocumentToCode(document: unknown): string {
  const doc = document as Record<string, any>;
  // AnyVali format (has root.kind)
  if (doc.root && doc.root.kind) {
    return schemaNodeToCode(doc.root);
  }
  // Legacy JSON Schema format (has type)
  if (doc.type) {
    return jsonSchemaNodeToCode(doc);
  }
  return 'bsb.unknown()';
}

function eventNameToMethodName(eventName: string): string {
  return eventName.replace(/[.-](\w)/g, (_, c) => c.toUpperCase());
}

function pluginNameToClassName(pluginId: string): string {
  let name = pluginId;
  if (name.startsWith('service-')) {
    name = name.substring('service-'.length);
  }

  const pascal = name
    .replace(/[^a-zA-Z0-9-]/g, '')
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return `${pascal}Client`;
}

function eventNameToConstName(eventName: string, suffix: string): string {
  return `_${eventNameToMethodName(eventName)}${suffix}`;
}

const FLIP_MAP: Record<string, string> = {
  emitEvents: 'onEvents',
  onEvents: 'emitEvents',
  emitReturnableEvents: 'onReturnableEvents',
  onReturnableEvents: 'emitReturnableEvents',
  emitBroadcast: 'onBroadcast',
  onBroadcast: 'emitBroadcast',
};

function generateVirtualClient(schemaExport: EventSchemaExport, importBase: string, pluginId: string): string {
  const lines: string[] = [];
  const className = pluginNameToClassName(pluginId);

  lines.push('/**');
  lines.push(` * Auto-generated BSB virtual client for ${schemaExport.pluginName}`);
  lines.push(' * DO NOT EDIT - Regenerated on every build');
  lines.push(` * @version ${schemaExport.version}`);
  lines.push(' */');
  if (importBase === '@bsb/base') {
    lines.push('import { ServiceClient, BSBService, bsb, optional, nullable, createReturnableEvent, createFireAndForgetEvent, createBroadcastEvent, createEventSchemas } from "@bsb/base";');
    lines.push('import type { Observable, BSBServiceClientDefinition, EventInputType, EventOutputType } from "@bsb/base";');
  } else {
    lines.push('import { ServiceClient, BSBService, bsb, optional, nullable } from "../../index.js";');
    lines.push('import { createReturnableEvent, createFireAndForgetEvent, createBroadcastEvent, createEventSchemas } from "../../interfaces/schema-events.js";');
    lines.push('import type { Observable, BSBServiceClientDefinition, EventInputType, EventOutputType } from "../../index.js";');
  }
  lines.push('');

  const categorizedEvents: Record<string, Array<{ name: string; def: EventExportDefinition }>> = {
    emitEvents: [],
    onEvents: [],
    emitReturnableEvents: [],
    onReturnableEvents: [],
    emitBroadcast: [],
    onBroadcast: [],
  };

  for (const [eventName, eventDef] of Object.entries(schemaExport.events)) {
    if (categorizedEvents[eventDef.category]) {
      categorizedEvents[eventDef.category].push({ name: eventName, def: eventDef });
    }
  }

  const constsDone = new Set<string>();
  for (const events of Object.values(categorizedEvents)) {
    for (const { name, def } of events) {
      const inputConst = eventNameToConstName(name, 'Schema');
      if (!constsDone.has(inputConst)) {
        lines.push(`const ${inputConst} = ${anyValiDocumentToCode(def.inputSchema)};`);
        constsDone.add(inputConst);
      }

      if (def.type === 'returnable' && def.outputSchema) {
        const outputConst = eventNameToConstName(name, 'OutputSchema');
        if (!constsDone.has(outputConst)) {
          lines.push(`const ${outputConst} = ${anyValiDocumentToCode(def.outputSchema)};`);
          constsDone.add(outputConst);
        }
      }
    }
  }

  if (constsDone.size > 0) {
    lines.push('');
  }

  lines.push('const _EventSchemas = createEventSchemas({');
  for (const [category, events] of Object.entries(categorizedEvents)) {
    if (events.length === 0) continue;

    lines.push(`  ${category}: {`);
    for (const { name, def } of events) {
      const inputConst = eventNameToConstName(name, 'Schema');
      const descriptionArg = def.description !== undefined ? `, ${JSON.stringify(def.description)}` : '';

      if (def.type === 'returnable') {
        const outputConst = eventNameToConstName(name, 'OutputSchema');
        if (def.defaultTimeout !== undefined) {
          if (def.description !== undefined) {
            lines.push(`    '${name}': createReturnableEvent(${inputConst}, ${outputConst}, ${JSON.stringify(def.description)}, ${def.defaultTimeout}),`);
          } else {
            lines.push(`    '${name}': createReturnableEvent(${inputConst}, ${outputConst}, undefined, ${def.defaultTimeout}),`);
          }
        } else {
          lines.push(`    '${name}': createReturnableEvent(${inputConst}, ${outputConst}${descriptionArg}),`);
        }
      } else if (def.type === 'broadcast') {
        lines.push(`    '${name}': createBroadcastEvent(${inputConst}${descriptionArg}),`);
      } else {
        lines.push(`    '${name}': createFireAndForgetEvent(${inputConst}${descriptionArg}),`);
      }
    }
    lines.push('  },');
  }
  lines.push('});');
  lines.push('');

  // --- Exported Types (inferred from BSBType schemas) ---
  const typesDone = new Set<string>();
  for (const events of Object.values(categorizedEvents)) {
    for (const { name, def } of events) {
      const camel = eventNameToMethodName(name);
      const typeName = camel.charAt(0).toUpperCase() + camel.slice(1);
      const inputTypeName = `${typeName}Input`;
      if (!typesDone.has(inputTypeName)) {
        const inputConst = eventNameToConstName(name, 'Schema');
        lines.push(`export type ${inputTypeName} = EventInputType<{ input: typeof ${inputConst} }>;`);
        typesDone.add(inputTypeName);
      }

      if (def.type === 'returnable' && def.outputSchema) {
        const outputTypeName = `${typeName}Output`;
        if (!typesDone.has(outputTypeName)) {
          const outputConst = eventNameToConstName(name, 'OutputSchema');
          lines.push(`export type ${outputTypeName} = EventOutputType<{ output: typeof ${outputConst} }>;`);
          typesDone.add(outputTypeName);
        }
      }
    }
  }
  lines.push('');

  lines.push('const _PLUGIN_CLIENT: BSBServiceClientDefinition = {');
  lines.push(`  name: "${pluginId}",`);
  lines.push('};');
  lines.push('');
  lines.push('class _PluginRef {');
  lines.push('  static PLUGIN_CLIENT = _PLUGIN_CLIENT;');
  lines.push('}');
  lines.push('');

  lines.push(`export default class ${className} extends ServiceClient<any, typeof _EventSchemas, typeof _PluginRef> {`);
  lines.push('  constructor(context: BSBService) {');
  lines.push('    super(_PluginRef, context);');
  lines.push('  }');

  for (const [category, events] of Object.entries(categorizedEvents)) {
    const clientCategory = FLIP_MAP[category];
    if (!clientCategory) continue;

    for (const { name, def } of events) {
      const methodName = eventNameToMethodName(name);
      const typeName = methodName.charAt(0).toUpperCase() + methodName.slice(1);
      const inputTypeName = `${typeName}Input`;
      const description = def.description || name;

      lines.push('');
      if (clientCategory === 'emitEvents') {
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${methodName}(obs: Observable, input: ${inputTypeName}): Promise<void> {`);
        lines.push(`    await this.events.emitEvent("${name}", obs, input);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'emitReturnableEvents') {
        const outputTypeName = `${typeName}Output`;
        const timeout = def.defaultTimeout ?? 5;
        lines.push(`  /** ${description} (default timeout: ${timeout}s) */`);
        lines.push(`  async ${methodName}(obs: Observable, input: ${inputTypeName}, timeout: number = ${timeout}): Promise<${outputTypeName}> {`);
        lines.push(`    return this.events.emitEventAndReturn("${name}", obs, input, timeout);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'emitBroadcast') {
        const emitMethodName = `emit${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${emitMethodName}(obs: Observable, input: ${inputTypeName}): Promise<void> {`);
        lines.push(`    await this.events.emitBroadcast("${name}", obs, input);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'onEvents') {
        const onMethodName = `on${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<void>): Promise<void> {`);
        lines.push(`    await this.events.onEvent("${name}", obs, handler);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'onReturnableEvents') {
        const outputTypeName = `${typeName}Output`;
        const onMethodName = `on${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<${outputTypeName}>): Promise<void> {`);
        lines.push(`    await this.events.onReturnableEvent("${name}", obs, handler);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'onBroadcast') {
        const onMethodName = `on${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<void>): Promise<void> {`);
        lines.push(`    await this.events.onBroadcast("${name}", obs, handler);`);
        lines.push('  }');
      }
    }
  }

  lines.push('}');
  lines.push(`export { ${className} };`);
  lines.push('');

  return lines.join('\n');
}

function processSchemaDirectory(
  schemasDir: string,
  clientsDir: string,
  importBase: string,
  skipPlugins?: Set<string>,
): { generated: number; errors: number } {
  let generated = 0;
  let errors = 0;

  if (!fs.existsSync(schemasDir)) {
    return { generated, errors };
  }

  const schemaFiles = fs.readdirSync(schemasDir)
    .filter((file) => file.endsWith('.json') && !file.endsWith('.plugin.json'));

  for (const schemaFile of schemaFiles) {
    try {
      const pluginId = path.basename(schemaFile, '.json');
      if (skipPlugins?.has(pluginId)) {
        continue;
      }

      const schemaPath = path.join(schemasDir, schemaFile);
      const schemaExport: EventSchemaExport = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      if (!schemaExport.events || Object.keys(schemaExport.events).length === 0) {
        continue;
      }

      const clientCode = generateVirtualClient(schemaExport, importBase, pluginId);
      fs.writeFileSync(path.join(clientsDir, `${pluginId}.ts`), clientCode, 'utf-8');
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
      const alreadyIgnored = lines.some((line) => {
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
        fs.writeFileSync(gitignorePath, `${content}${newline}${relativeBsbDir}\n`, 'utf-8');
        // eslint-disable-next-line no-console
        console.log(`  Added '${relativeBsbDir}' to .gitignore`);
      }
      return;
    }

    fs.writeFileSync(gitignorePath, `${relativeBsbDir}\n`, 'utf-8');
    // eslint-disable-next-line no-console
    console.log(`  Created .gitignore with '${relativeBsbDir}'`);
  } catch {
    // Non-fatal.
  }
}

async function main() {
  const projectRoot = process.cwd();
  const packageJsonPath = path.join(projectRoot, 'package.json');
  let importBase = '@bsb/base';

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name === '@bsb/base') {
        importBase = '../../base';
      }
    } catch {
      // Ignore package.json parse errors for this helper script.
    }
  }

  const clientsDir = path.join(projectRoot, 'src', '.bsb', 'clients');
  if (!fs.existsSync(clientsDir)) {
    fs.mkdirSync(clientsDir, { recursive: true });
  }

  ensureGitignore(projectRoot);

  let totalGenerated = 0;
  let totalErrors = 0;
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

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during client generation:', error);
    process.exit(1);
  });
}

export { main as generateClientTypes };
