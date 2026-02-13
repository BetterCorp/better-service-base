/**
 * BSB TypeScript Client Type Generator
 *
 * Generates TypeScript `.d.ts` files from exported schema JSON files.
 * These type files enable type-safe cross-plugin communication by importing
 * generated types and using them with ServiceClient.
 *
 * Usage:
 *   npm run generate-client-types
 *
 * Output:
 *   Writes TypeScript declaration files to lib/types/{plugin-name}.d.ts
 *
 * Example usage in consuming plugin:
 * ```typescript
 * import type { Plugin as TodoPlugin } from '@bsb/base/types/service-demo-todo';
 * const client = new ServiceClient<TodoPlugin>(TodoPlugin, this);
 * // Full type safety for client.events methods
 * const result = await client.events.emitEventAndReturn('todo.create', obs, {
 *   title: 'test',
 *   titleAS: 'invalid', // ✗ Error: Property 'titleAS' does not exist
 * });
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventSchemaExport, JSONSchemaType } from '../interfaces/schema-events';

/**
 * Convert JSON Schema format string to TypeScript type string.
 */
function jsonSchemaFormatToTSType(format?: string): string {
  switch (format) {
    case 'int32':
    case 'int64':
    case 'float':
    case 'double':
      return 'number';
    case 'datetime':
    case 'date':
    case 'time':
    case 'uuid':
    case 'uri':
    case 'email':
    case 'ipv4':
    case 'ipv6':
    case 'hostname':
      return 'string';
    default:
      return 'string';
  }
}

/**
 * Convert JSON Schema to TypeScript type definition.
 */
function jsonSchemaToTSType(schema: JSONSchemaType, indent = 0): string {
  const indentStr = '  '.repeat(indent);

  // Handle enum
  if (schema.enum) {
    return schema.enum.map((v: any) => JSON.stringify(v)).join(' | ');
  }

  // Handle array type (can be string or string[])
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];

  // Handle union of types
  if (types.length > 1) {
    return types.map((t: any) => {
      const tempSchema = { ...schema, type: t };
      return jsonSchemaToTSType(tempSchema, indent);
    }).join(' | ');
  }

  const type = types[0];

  switch (type) {
    case 'string':
      return jsonSchemaFormatToTSType(schema.format);

    case 'number':
    case 'integer':
      return 'number';

    case 'boolean':
      return 'boolean';

    case 'array':
      if (schema.items) {
        const itemType = jsonSchemaToTSType(schema.items, indent);
        return `Array<${itemType}>`;
      }
      return 'Array<any>';

    case 'object': {
      if (!schema.properties) {
        return 'Record<string, any>';
      }

      const required = schema.required || [];
      const lines: string[] = [];

      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(key);
        const propType = jsonSchemaToTSType(propSchema as JSONSchemaType, indent + 1);
        const optional = isRequired ? '' : '?';
        const propSchemaTyped = propSchema as JSONSchemaType;
        const description = propSchemaTyped.description ? `/** ${propSchemaTyped.description} */\n${indentStr}  ` : '';
        lines.push(`${description}readonly ${key}${optional}: ${propType};`);
      }

      if (lines.length === 0) {
        return '{}';
      }

      return `{\n${indentStr}  ${lines.join(`\n${indentStr}  `)}\n${indentStr}}`;
    }

    case 'null':
      return 'null';

    default:
      // Handle oneOf (union types)
      if (schema.oneOf && Array.isArray(schema.oneOf)) {
        if (schema.oneOf.length === 0) {
          return 'any'; // unknown type
        }
        return schema.oneOf.map((s: any) => jsonSchemaToTSType(s as JSONSchemaType, indent)).join(' | ');
      }

      return 'any';
  }
}

/**
 * Generate TypeScript declaration file from exported schema.
 */
function generateTypeDefinition(schemaExport: EventSchemaExport): string {
  const lines: string[] = [];

  // File header
  lines.push(`/**`);
  lines.push(` * Auto-generated TypeScript types for ${schemaExport.pluginName}`);
  lines.push(` * Generated from BSB event schemas`);
  lines.push(` * @version ${schemaExport.version}`);
  lines.push(` */`);
  lines.push('');
  lines.push(`import type { BSBService, BSBEventSchemas } from '@bsb/base';`);
  lines.push('');

  // Group events by category
  const categorizedEvents: Record<string, Array<{ name: string; def: any }>> = {
    emitEvents: [],
    onEvents: [],
    emitReturnableEvents: [],
    onReturnableEvents: [],
    emitBroadcast: [],
    onBroadcast: [],
  };

  for (const [eventName, eventDef] of Object.entries(schemaExport.events)) {
    const def = eventDef as any;
    categorizedEvents[def.category].push({ name: eventName, def: eventDef });
  }

  // Generate EventSchemas type
  lines.push(`/**`);
  lines.push(` * Event schemas for ${schemaExport.pluginName}`);
  lines.push(` */`);
  lines.push(`export declare const EventSchemas: {`);

  for (const [category, events] of Object.entries(categorizedEvents)) {
    if (events.length === 0) continue;

    lines.push(`  ${category}: {`);

    for (const { name, def } of events) {
      if (def.description) {
        lines.push(`    /** ${def.description} */`);
      }

      const inputType = jsonSchemaToTSType(def.inputSchema, 2);

      if (def.type === 'returnable') {
        const outputType = def.outputSchema ? jsonSchemaToTSType(def.outputSchema, 2) : 'void';
        lines.push(`    '${name}': {`);
        lines.push(`      readonly input: ${inputType};`);
        lines.push(`      readonly output: ${outputType};`);
        lines.push(`      readonly __brand: 'returnable';`);
        lines.push(`    };`);
      } else {
        // fire-and-forget or broadcast
        const brand = def.type === 'broadcast' ? 'broadcast' : 'fire-and-forget';
        lines.push(`    '${name}': {`);
        lines.push(`      readonly input: ${inputType};`);
        lines.push(`      readonly __brand: '${brand}';`);
        lines.push(`    };`);
      }
    }

    lines.push(`  };`);
  }

  lines.push(`};`);
  lines.push('');

  // Generate Plugin class declaration
  lines.push(`/**`);
  lines.push(` * Plugin class for ${schemaExport.pluginName}`);
  lines.push(` */`);
  lines.push(`export declare class Plugin extends BSBService<any, typeof EventSchemas> {`);
  lines.push(`  static readonly Config: any;`);
  lines.push(`  static readonly EventSchemas: typeof EventSchemas;`);
  lines.push(`}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Main generation function.
 */
async function main() {
  // Use current working directory (allows calling from plugin projects)
  // When called via npm script, cwd is the project root
  // When called via bsb-plugin-cli, cwd is the plugin project root
  const projectRoot = process.cwd();
  const schemasDir = path.join(projectRoot, 'lib', 'schemas');
  const typesDir = path.join(projectRoot, 'lib', 'types');

  // Ensure schemas directory exists
  if (!fs.existsSync(schemasDir)) {
    // eslint-disable-next-line no-console
    console.error('Error: schemas directory not found. Run npm run export-schemas first.');
    process.exit(1);
  }

  // Create types output directory
  if (!fs.existsSync(typesDir)) {
    fs.mkdirSync(typesDir, { recursive: true });
  }

  // Find all schema JSON files
  const schemaFiles = fs.readdirSync(schemasDir)
    .filter(file => file.endsWith('.json'));

  if (schemaFiles.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No schema files found to generate types from.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Found ${schemaFiles.length} schema file(s) to generate types from...`);

  let generateCount = 0;
  let errorCount = 0;

  // Process each schema file
  for (const schemaFile of schemaFiles) {
    try {
      // Skip plugin metadata files
      if (schemaFile.endsWith('.plugin.json')) {
        continue;
      }

      const schemaPath = path.join(schemasDir, schemaFile);
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      const schemaExport: EventSchemaExport = JSON.parse(schemaContent);

      // Use schema filename (without .json) for type file name
      const pluginId = path.basename(schemaFile, '.json');

      // Generate TypeScript declaration
      const typeDefinition = generateTypeDefinition(schemaExport);

      // Write to file using plugin ID (from filename, not display name)
      const outputPath = path.join(typesDir, `${pluginId}.d.ts`);
      fs.writeFileSync(outputPath, typeDefinition, 'utf-8');

      // eslint-disable-next-line no-console
      console.log(`  Generated types for ${pluginId} (v${schemaExport.version})`);
      generateCount++;
    } catch (error) {
      errorCount++;
      // eslint-disable-next-line no-console
      console.error(`  Error generating types for ${schemaFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nType generation complete: ${generateCount} generated, ${errorCount} errors`);
  // eslint-disable-next-line no-console
  console.log(`Types written to: ${typesDir}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during type generation:', error);
    process.exit(1);
  });
}

export { main as generateClientTypes };
