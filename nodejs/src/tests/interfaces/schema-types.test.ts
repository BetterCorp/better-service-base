import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as av from '@anyvali/js';
import { bsb, optional, withDescription, exportPortableSchema, importPortableSchema } from '../../interfaces/schema-types';

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
});
