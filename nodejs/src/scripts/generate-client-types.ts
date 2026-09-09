/**
 * BSB Virtual Client Generator
 *
 * Generates TypeScript virtual client files from exported AnyVali schema documents.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventSchemaExport, EventExportDefinition } from '../interfaces/schema-events.js';
import { clientSchemaCode } from './anyvali-client-schema.js';
import { isMainModule } from '../base/module-runtime.js';

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

function anyValiDocumentToCode(document: unknown, name: string, lines: string[]): string {
  const doc = document as Record<string, any>;
  // AnyVali format (has root.kind)
  if (doc.root && doc.root.kind) {
    const code = clientSchemaCode(doc as any, name);
    lines.push(...code.declarations);
    return code.expression;
  }
  // Legacy JSON Schema format (has type)
  if (doc.type) {
    return jsonSchemaNodeToCode(doc);
  }
  return 'bsb.unknown()';
}

function eventNameToMethodName(eventName: string): string {
  const name = eventName.replace(/[^a-zA-Z0-9_$]+(.)?/g, (_, c) => c ? c.toUpperCase() : "");
  return /^[a-zA-Z_$]/.test(name) ? name : `_${name}`;
}

function pluginNameToClassName(pluginId: string): string {
  let name = pluginId;
  if (name.startsWith('service-')) {
    name = name.substring('service-'.length);
  }

  const pascal = name
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return `${/^\d/.test(pascal) ? "_" : ""}${pascal}Client`;
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
  const comment = (value: unknown) => String(value).replace(/\*\//g, "* /").replace(/[\r\n]/g, " ");
  const schemaName = comment(schemaExport.displayName ?? schemaExport.pluginId ?? schemaExport.pluginName);

  lines.push('/**');
  lines.push(` * Auto-generated BSB virtual client for ${schemaName}`);
  lines.push(' * DO NOT EDIT - Regenerated on every build');
  lines.push(` * @version ${comment(schemaExport.version)}`);
  lines.push(' */');
  if (importBase === '@bsb/base') {
    lines.push('import { ServiceClient, BSBService, bsb, optional, nullable, importPortableSchema, createReturnableEvent, createFireAndForgetEvent, createBroadcastEvent, createEventSchemas } from "@bsb/base";');
    lines.push('import type { Observable, BSBServiceClientDefinition, EventInputType, EventOutputType } from "@bsb/base";');
  } else {
    lines.push('import { ServiceClient, BSBService, bsb, optional, nullable, importPortableSchema } from "../../index.js";');
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

  const methods = new Set(['constructor', '_requireClientEvents']);
  const types = new Set<string>();
  for (const [eventName, eventDef] of Object.entries(schemaExport.events)) {
    const category = FLIP_MAP[eventDef.category];
    if (!category) throw new Error(`Unknown event category: ${eventDef.category}`);
    if (!['fire-and-forget', 'returnable', 'broadcast'].includes(eventDef.type)) throw new Error(`Unknown event type: ${eventDef.type}`);
    if (eventDef.defaultTimeout !== undefined && (!Number.isFinite(eventDef.defaultTimeout) || eventDef.defaultTimeout <= 0 || eventDef.defaultTimeout > 86400)) {
      throw new Error(`Invalid event timeout: ${eventName}`);
    }
    const name = eventNameToMethodName(eventName);
    const title = name.charAt(0).toUpperCase() + name.slice(1);
    const method = category.startsWith('on') ? `on${title}` : category === 'emitBroadcast' ? `emit${title}` : name;
    const generated = category.endsWith('Broadcast') ? [method] : [method, `${method}Specific`];
    if (types.has(title) || generated.some(value => methods.has(value))) throw new Error(`Generated event name collision: ${eventName}`);
    types.add(title);
    generated.forEach(value => methods.add(value));
    categorizedEvents[eventDef.category].push({ name: eventName, def: eventDef });
  }

  const constsDone = new Set<string>();
  for (const events of Object.values(categorizedEvents)) {
    for (const { name, def } of events) {
      const inputConst = eventNameToConstName(name, 'Schema');
      if (!constsDone.has(inputConst)) {
        lines.push(`const ${inputConst} = ${anyValiDocumentToCode(def.inputSchema, inputConst, lines)};`);
        constsDone.add(inputConst);
      }

      if (def.type === 'returnable' && def.outputSchema) {
        const outputConst = eventNameToConstName(name, 'OutputSchema');
        if (!constsDone.has(outputConst)) {
          lines.push(`const ${outputConst} = ${anyValiDocumentToCode(def.outputSchema, outputConst, lines)};`);
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
            lines.push(`    [${JSON.stringify(name)}]: createReturnableEvent(${inputConst}, ${outputConst}, ${JSON.stringify(def.description)}, ${def.defaultTimeout}),`);
          } else {
            lines.push(`    [${JSON.stringify(name)}]: createReturnableEvent(${inputConst}, ${outputConst}, undefined, ${def.defaultTimeout}),`);
          }
        } else {
          lines.push(`    [${JSON.stringify(name)}]: createReturnableEvent(${inputConst}, ${outputConst}${descriptionArg}),`);
        }
      } else if (def.type === 'broadcast') {
        lines.push(`    [${JSON.stringify(name)}]: createBroadcastEvent(${inputConst}${descriptionArg}),`);
      } else {
        lines.push(`    [${JSON.stringify(name)}]: createFireAndForgetEvent(${inputConst}${descriptionArg}),`);
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
  lines.push(`  name: ${JSON.stringify(schemaExport.pluginId ?? pluginId)},`);
  lines.push('};');
  lines.push('');
  lines.push('class _PluginRef {');
  lines.push('  static PLUGIN_CLIENT = _PLUGIN_CLIENT;');
  lines.push('  static EventSchemas = _EventSchemas;');
  lines.push('}');
  lines.push('');

  lines.push(`export default class ${className} extends ServiceClient<any, typeof _EventSchemas, typeof _PluginRef> {`);
  lines.push('  constructor(context: BSBService) {');
  lines.push('    super(_PluginRef, context);');
  lines.push('  }');
  lines.push('');
  lines.push('  private _requireClientEvents(methodName: string, eventName: string) {');
  lines.push('    const events = this.events as any;');
  lines.push('    if (!events || typeof events[methodName] !== "function") {');
  lines.push(
    `      throw new Error(\`[BSB Client Error] ${className} cannot use "\${eventName}" via \${methodName} because this generated client has no events facade yet. ` +
    `Generated service clients are wired by BSB during service setup. Create generated clients in your service constructor with the running BSBService context so BSB can register them before init/run. ` +
    `If this client was created inside init/onRegistered/run and used immediately, move construction to the constructor. ` +
    `If you are trying to listen to an event this same plugin emits, do not instantiate its generated client as a self-listener; listen through the generated client for the emitting service, or use this.createSelf() only for explicit self-invocation of own handlers.\`);`
  );
  lines.push('    }');
  lines.push('    return events;');
  lines.push('  }');

  for (const [category, events] of Object.entries(categorizedEvents)) {
    const clientCategory = FLIP_MAP[category];
    if (!clientCategory) continue;

    for (const { name, def } of events) {
      const methodName = eventNameToMethodName(name);
      const typeName = methodName.charAt(0).toUpperCase() + methodName.slice(1);
      const inputTypeName = `${typeName}Input`;
      const description = comment(def.description || name);

      lines.push('');
      if (clientCategory === 'emitEvents') {
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${methodName}(obs: Observable, input: ${inputTypeName}): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("emitEvent", ${JSON.stringify(name)});`);
        lines.push(`    await events.emitEvent(${JSON.stringify(name)}, obs, input);`);
        lines.push('  }');
        lines.push('');
        lines.push(`  /** ${description} for a specific server */`);
        lines.push(`  async ${methodName}Specific(serverId: string, obs: Observable, input: ${inputTypeName}): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("emitEventSpecific", ${JSON.stringify(name)});`);
        lines.push(`    await events.emitEventSpecific(${JSON.stringify(name)}, serverId, obs, input);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'emitReturnableEvents') {
        const outputTypeName = `${typeName}Output`;
        const timeout = def.defaultTimeout ?? 5;
        lines.push(`  /** ${description} (default timeout: ${timeout}s) */`);
        lines.push(`  async ${methodName}(obs: Observable, input: ${inputTypeName}, timeout: number = ${timeout}): Promise<${outputTypeName}> {`);
        lines.push(`    const events = this._requireClientEvents("emitEventAndReturn", ${JSON.stringify(name)});`);
        lines.push(`    return events.emitEventAndReturn(${JSON.stringify(name)}, obs, input, timeout);`);
        lines.push('  }');
        lines.push('');
        lines.push(`  /** ${description} for a specific server (default timeout: ${timeout}s) */`);
        lines.push(`  async ${methodName}Specific(serverId: string, obs: Observable, input: ${inputTypeName}, timeout: number = ${timeout}): Promise<${outputTypeName}> {`);
        lines.push(`    const events = this._requireClientEvents("emitEventAndReturnSpecific", ${JSON.stringify(name)});`);
        lines.push(`    return events.emitEventAndReturnSpecific(${JSON.stringify(name)}, serverId, obs, input, timeout);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'onEvents') {
        const onMethodName = `on${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<void>): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("onEvent", ${JSON.stringify(name)});`);
        lines.push(`    await events.onEvent(${JSON.stringify(name)}, obs, handler);`);
        lines.push('  }');
        lines.push('');
        lines.push(`  /** ${description} for a specific server */`);
        lines.push(`  async ${onMethodName}Specific(serverId: string, obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<void>): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("onEventSpecific", ${JSON.stringify(name)});`);
        lines.push(`    await events.onEventSpecific(${JSON.stringify(name)}, serverId, obs, handler);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'onReturnableEvents') {
        const outputTypeName = `${typeName}Output`;
        const onMethodName = `on${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<${outputTypeName}>): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("onReturnableEvent", ${JSON.stringify(name)});`);
        lines.push(`    await events.onReturnableEvent(${JSON.stringify(name)}, obs, handler);`);
        lines.push('  }');
        lines.push('');
        lines.push(`  /** ${description} for a specific server */`);
        lines.push(`  async ${onMethodName}Specific(serverId: string, obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<${outputTypeName}>): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("onReturnableEventSpecific", ${JSON.stringify(name)});`);
        lines.push(`    await events.onReturnableEventSpecific(${JSON.stringify(name)}, serverId, obs, handler);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'emitBroadcast') {
        const emitMethodName = `emit${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${emitMethodName}(obs: Observable, input: ${inputTypeName}): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("emitBroadcast", ${JSON.stringify(name)});`);
        lines.push(`    await events.emitBroadcast(${JSON.stringify(name)}, obs, input);`);
        lines.push('  }');
        continue;
      }

      if (clientCategory === 'onBroadcast') {
        const onMethodName = `on${methodName.charAt(0).toUpperCase()}${methodName.slice(1)}`;
        lines.push(`  /** ${description} */`);
        lines.push(`  async ${onMethodName}(obs: Observable, handler: (handlerObs: Observable, input: ${inputTypeName}) => Promise<void>): Promise<void> {`);
        lines.push(`    const events = this._requireClientEvents("onBroadcast", ${JSON.stringify(name)});`);
        lines.push(`    await events.onBroadcast(${JSON.stringify(name)}, obs, handler);`);
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
): { generated: number; skipped: number; errors: number } {
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  if (!fs.existsSync(schemasDir)) {
    return { generated, skipped, errors };
  }

  const schemaFiles = fs.readdirSync(schemasDir)
    .filter((file) => file.endsWith('.json') && !file.endsWith('.plugin.json'));

  for (const schemaFile of schemaFiles) {
    try {
      const pluginId = path.basename(schemaFile, '.json');
      if (skipPlugins?.has(pluginId)) {
        skipped++;
        // eslint-disable-next-line no-console
        console.log(`  Skipped ${schemaFile}: plugin is excluded`);
        continue;
      }

      const schemaPath = path.join(schemasDir, schemaFile);
      const schemaExport: EventSchemaExport = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      if (!schemaExport.events || Object.keys(schemaExport.events).length === 0) {
        skipped++;
        // eslint-disable-next-line no-console
        console.log(`  Skipped ${schemaFile}: no events to generate a client for`);
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

  return { generated, skipped, errors };
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
  let totalSkipped = 0;
  let totalErrors = 0;
  const bsbSchemasDir = path.join(projectRoot, 'src', '.bsb', 'schemas');

  if (fs.existsSync(bsbSchemasDir)) {
    // eslint-disable-next-line no-console
    console.log('Processing schemas...');
    const { generated, skipped, errors } = processSchemaDirectory(bsbSchemasDir, clientsDir, importBase);
    totalGenerated += generated;
    totalSkipped += skipped;
    totalErrors += errors;
  }

  if (totalGenerated === 0 && totalErrors === 0) {
    // eslint-disable-next-line no-console
    console.log(totalSkipped > 0
      ? `No clients generated. Skipped ${totalSkipped} schema file(s).`
      : 'No schema files found to generate clients from.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`\nClient generation complete: ${totalGenerated} generated, ${totalSkipped} skipped, ${totalErrors} errors`);
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

export { main as generateClientTypes, generateVirtualClient, pluginNameToClassName };
