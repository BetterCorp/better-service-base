type Node = Record<string, unknown>;

export function unwrapSchema(node: Node | null): Node | null {
  let current = node;
  while (current && (current.kind === 'optional' || current.kind === 'nullable')) {
    const inner = (current.inner ?? current.schema) as Node | undefined;
    if (!inner) return null;
    current = { ...inner, metadata: { ...(inner.metadata as Node), ...(current.metadata as Node) } };
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
