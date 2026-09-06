import { importPortableSchema, type AnyValiDocument } from '../interfaces/schema-types.js';

/** Generate static types separately from the complete runtime interchange document. */
export function clientSchemaCode(document: AnyValiDocument, name: string): { declarations: string[]; expression: string } {
  importPortableSchema(document); // Reject unsupported or malformed schemas before writing source.
  const definitions = document.definitions ?? {};
  const names = new Map(Object.keys(definitions).map((key, index) => [key, `${name}Definition${index}`]));
  function type(node: any): string {
    switch (node.kind) {
      case 'string': return 'string';
      case 'bool': return 'boolean';
      case 'null': return 'null';
      case 'any': case 'unknown': return 'unknown';
      case 'never': return 'never';
      case 'number': case 'int': case 'int8': case 'int16': case 'int32': case 'int64':
      case 'uint8': case 'uint16': case 'uint32': case 'uint64': case 'float32': case 'float64': return 'number';
      case 'literal': return JSON.stringify(node.value);
      case 'enum': return node.values.map((value: unknown) => JSON.stringify(value)).join(' | ') || 'never';
      case 'optional': return `(${type(node.inner)}) | undefined`;
      case 'nullable': return `(${type(node.inner)}) | null`;
      case 'array': return `Array<${type(node.items)}>`;
      case 'tuple': return `[${node.items.map(type).join(', ')}]`;
      case 'record': return `Record<string, ${type(node.valueSchema ?? node.values)}>`;
      case 'union': return node.variants.map((item: any) => `(${type(item)})`).join(' | ');
      case 'intersection': return node.allOf.map((item: any) => `(${type(item)})`).join(' & ');
      case 'ref': {
        const resolved = names.get(node.ref);
        if (!resolved) throw new Error(`Missing AnyVali definition: ${node.ref}`);
        return resolved;
      }
      case 'object': {
        const properties = Object.entries(node.properties ?? {}).map(([key, value]: [string, any]) => {
          const optional = !(node.required ?? []).includes(key) || value.kind === 'optional';
          return `${JSON.stringify(key)}${optional ? '?' : ''}: ${type(value)}`;
        });
        if (node.unknownKeys === 'passthrough') properties.push('[key: string]: unknown');
        return `{ ${properties.join('; ')} }`;
      }
      default: throw new Error(`Unsupported AnyVali kind: ${node.kind}`);
    }
  }
  return {
    declarations: Object.entries(definitions).map(([key, node]) => `type ${names.get(key)} = ${type(node)};`),
    expression: `importPortableSchema<${type(document.root)}>(JSON.parse(${JSON.stringify(JSON.stringify(document))}))`,
  };
}
