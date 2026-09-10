type Node = Record<string, unknown>;

// Examples use only schema structure, never stored config or composite defaults.
export function schemaJsonExample(raw: Node | null): unknown {
  function example(value: unknown, depth = 0, sensitive = false): unknown {
    if (!value || typeof value !== 'object' || depth > 12) return null;
    const node = value as Node;
    const metadata = node.metadata as Node | undefined;
    sensitive ||= metadata?.sensitive === true || metadata?.writeonly === true;
    if (node.kind === 'optional' || node.kind === 'nullable') return example(node.inner ?? node.schema, depth + 1, sensitive);
    if (node.kind === 'object') return Object.fromEntries(Object.entries((node.properties ?? {}) as Node).map(([key, child]) => [key, example(child, depth + 1, sensitive)]));
    if (node.kind === 'array') return [example(node.items ?? node.item, depth + 1, sensitive)];
    if (node.kind === 'record') return { key: example(node.valueSchema ?? node.values ?? node.value, depth + 1, sensitive) };
    if (node.kind === 'tuple') return ((node.items ?? node.elements ?? []) as unknown[]).map(child => example(child, depth + 1, sensitive));
    if (node.kind === 'union') return example(((node.variants ?? node.schemas ?? []) as unknown[])[0], depth + 1, sensitive);
    if (sensitive) return 'REPLACE_ME';
    if (Object.hasOwn(node, 'default') && (node.default === null || ['string', 'number', 'boolean'].includes(typeof node.default))) return node.default;
    if (node.kind === 'enum') return (node.values as unknown[])?.[0] ?? null;
    if (node.kind === 'literal') return node.value ?? null;
    if (node.kind === 'bool' || node.kind === 'boolean') return false;
    if (['int', 'int32', 'int64', 'number', 'float', 'float32', 'float64'].includes(String(node.kind))) return typeof node.min === 'number' ? node.min : 1;
    if (node.kind === 'string') return 'example';
    return null;
  }
  return example(raw);
}

export function unwrapSchema(node: Node | null): Node | null {
  let current = node;
  while (current && (current.kind === 'optional' || current.kind === 'nullable')) {
    const inner = (current.inner ?? current.schema) as Node | undefined;
    if (!inner) return null;
    current = {
      ...inner,
      ...(Object.hasOwn(current, 'default') ? { default: current.default } : {}),
      metadata: { ...(inner.metadata as Node), ...(current.metadata as Node) },
    };
  }
  return current;
}

// Collections are replaced as a whole: preserving secrets by array index would
// attach the wrong credential after a reorder. References use the same editor.
export function isSensitiveSchema(raw: Node | null): boolean {
  function contains(node: unknown, nested = false): boolean {
    if (!node || typeof node !== 'object') return false;
    const value = node as Node;
    const meta = value.metadata as Node | undefined;
    if (meta?.sensitive === true || meta?.writeonly === true || value.kind === 'ref') return true;
    if (value.kind === 'optional' || value.kind === 'nullable') return contains(value.inner ?? value.schema, nested);
    if (value.kind === 'object') return nested && Object.values((value.properties ?? {}) as Node).some(child => contains(child, true));
    const children = value.items ?? value.item ?? value.elements ?? value.valueSchema ?? value.values ?? value.value ?? value.variants ?? value.schemas ?? value.allOf;
    return Array.isArray(children) ? children.some(child => contains(child, true)) : contains(children, true);
  }
  return contains(raw);
}

export function sensitiveSchemaPaths(node: Node, prefix = ''): string[] {
  if (isSensitiveSchema(node)) return [prefix];
  const root = unwrapSchema(node);
  if (root?.kind !== 'object') return [];
  return Object.entries((root.properties ?? {}) as Node).flatMap(([key, child]) =>
    sensitiveSchemaPaths(child as Node, prefix ? `${prefix}.${key}` : key));
}
