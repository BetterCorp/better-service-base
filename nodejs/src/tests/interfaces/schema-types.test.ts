import * as assert from 'assert';
import * as av from 'anyvali';
import { bsb, optional, withDescription, exportPortableSchema, importPortableSchema } from '../../interfaces/schema-types.js';

describe('schema-types', () => {
  it('builds numeric schemas on top of AnyVali', () => {
    const schema = bsb.int32({ min: 0, max: 10, description: 'Count' });

    assert.strictEqual(schema.parse(5), 5);
    assert.throws(() => schema.parse(11));
    const document = exportPortableSchema(schema);
    assert.strictEqual(document.root.kind, 'int32');
    assert.strictEqual(document.root.min, 0);
    assert.strictEqual(document.root.max, 10);
    assert.strictEqual(document.extensions.bsb.description, 'Count');
  });

  it('exports object schemas with strip semantics', () => {
    const schema = bsb.object({
      id: bsb.string({ description: 'Identifier' }),
      name: optional(bsb.string()),
    }, 'User');

    const parsed = schema.parse({
      id: '123',
      name: 'test',
      ignored: true,
    });

    assert.deepStrictEqual(parsed, { id: '123', name: 'test' });
    const document = exportPortableSchema(schema);
    assert.strictEqual(document.root.kind, 'object');
    if (document.root.kind !== 'object') {
      throw new Error('expected object schema');
    }
    assert.strictEqual(document.root.unknownKeys, 'strip');
    assert.deepStrictEqual(document.root.required, ['id']);
    assert.strictEqual(document.extensions.bsb.description, 'User');
  });

  it('round-trips portable AnyVali documents', () => {
    const original = withDescription(
      av.object({
        email: av.string().format('email'),
      }, { unknownKeys: 'strip' }),
      'Account',
    );

    const portable = exportPortableSchema(original);
    const imported = importPortableSchema(portable);

    assert.deepStrictEqual(imported.parse({ email: 'test@example.com', extra: true }), {
      email: 'test@example.com',
    });
    assert.throws(() => imported.parse({ email: 'not-an-email' }));
  });

  it('applies AnyVali defaults for missing object properties', () => {
    const schema = av.object({
      enabled: av.optional(av.bool()).default(true),
      retries: av.optional(av.int32().min(0)).default(3),
      tags: av.optional(av.array(av.string())).default(['default']),
    }, { unknownKeys: 'strip' });

    assert.deepStrictEqual(schema.parse({}), {
      enabled: true,
      retries: 3,
      tags: ['default'],
    });
    assert.deepStrictEqual(schema.parse({ enabled: false, retries: 0, tags: [] }), {
      enabled: false,
      retries: 0,
      tags: [],
    });
  });

  it('applies direct, optional, and nested defaults for object properties', () => {
    const schema = av.object({
      host: av.string().minLength(1).default('0.0.0.0'),
      port: av.int32().min(1).default(3200),
      labels: av.array(av.string()).default(['default']),
      optionalToken: av.optional(av.string()).default('token'),
      nested: av.object({
        mode: av.string().default('auto'),
      }, { unknownKeys: 'strip' }).default({}),
    }, { unknownKeys: 'strip' });

    assert.deepStrictEqual(schema.parse({}), {
      host: '0.0.0.0',
      port: 3200,
      labels: ['default'],
      optionalToken: 'token',
      nested: {
        mode: 'auto',
      },
    });
    assert.deepStrictEqual(schema.parse({
      port: 3211,
      nested: {
        extra: true,
      },
      unknown: true,
    }), {
      host: '0.0.0.0',
      port: 3211,
      labels: ['default'],
      optionalToken: 'token',
      nested: {
        mode: 'auto',
      },
    });
  });

  it('applies defaults declared on optional wrapper schemas', () => {
    assert.strictEqual(av.optional(av.string()).default('fallback').parse(undefined), 'fallback');
    assert.strictEqual(av.optional(av.int32()).default(42).parse(undefined), 42);
  });

  it('rejects invalid defaults declared on optional wrapper schemas', () => {
    const schema = av.optional(av.int32().min(10)).default(1);

    assert.throws(() => schema.parse(undefined), /default_invalid|Expected|minimum|min/i);
  });

  it('clones mutable AnyVali defaults between parses', () => {
    const schema = av.optional(av.array(av.string())).default(['default']);
    const first = schema.parse(undefined);
    first?.push('mutated');

    assert.deepStrictEqual(schema.parse(undefined), ['default']);
  });

  it('preserves AnyVali defaults through portable schema round-trip', () => {
    const original = av.object({
      host: av.optional(av.string()).default('localhost'),
      port: av.optional(av.int32().min(1).max(65535)).default(3210),
    }, { unknownKeys: 'strip' });
    const imported = importPortableSchema(exportPortableSchema(original));

    assert.deepStrictEqual(imported.parse({}), {
      host: 'localhost',
      port: 3210,
    });
    assert.deepStrictEqual(imported.parse({ port: 8080 }), {
      host: 'localhost',
      port: 8080,
    });
  });
});
