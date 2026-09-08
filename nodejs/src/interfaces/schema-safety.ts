import safeRegex from 'safe-regex2';

/** Bound untrusted schema traversal and reject unsafe patterns before AnyVali import. */
export function assertSafeSchemaDocument(document: unknown): void {
  const stack = [{ value: document, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++nodes > 10_000) throw new Error('Schema exceeds the maximum node count');
    if (depth > 64) throw new Error('Schema exceeds the maximum nesting depth');
    if (Array.isArray(value)) {
      for (const item of value) stack.push({ value: item, depth: depth + 1 });
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`Schema contains forbidden key ${key}`);
        if (key === 'pattern' && typeof item === 'string' && (item.length > 1024 || !safeRegex(item))) {
          throw new Error('Schema contains an unsafe regular expression');
        }
        stack.push({ value: item, depth: depth + 1 });
      }
    }
  }
}
