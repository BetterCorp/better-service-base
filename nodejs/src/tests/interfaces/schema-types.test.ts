/**
 * Tests for schema-types.ts - Cross-language type system
 */

import { describe, it } from 'mocha';
import * as assert from 'assert';
import { z } from 'zod';
import {
  int32,
  int64,
  float,
  double,
  uuid,
  datetime,
  string,
  boolean,
  bytes,
  enumType,
} from '../../interfaces/schema-types';

describe('schema-types - Cross-language type system', () => {
  describe('int32', () => {
    it('should create a number schema with int32 metadata', () => {
      const schema = int32('Test integer');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'int32');
      assert.strictEqual(schema.__bsbMetadata.format, 'int32');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test integer');
    });

    it('should validate 32-bit integer range', () => {
      const schema = int32();

      assert.doesNotThrow(() => schema.parse(0));
      assert.doesNotThrow(() => schema.parse(2147483647));
      assert.doesNotThrow(() => schema.parse(-2147483648));

      assert.throws(() => schema.parse(2147483648));
      assert.throws(() => schema.parse(-2147483649));
    });

    it('should reject non-integers', () => {
      const schema = int32();
      assert.throws(() => schema.parse(3.14));
      assert.throws(() => schema.parse('123'));
    });
  });

  describe('int64', () => {
    it('should create a number schema with int64 metadata', () => {
      const schema = int64('Test long');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'int64');
      assert.strictEqual(schema.__bsbMetadata.format, 'int64');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test long');
    });

    it('should validate 64-bit integer range', () => {
      const schema = int64();

      assert.doesNotThrow(() => schema.parse(0));
      assert.doesNotThrow(() => schema.parse(9007199254740991)); // Max safe integer in JS
      assert.doesNotThrow(() => schema.parse(-9007199254740991));
    });

    it('should reject non-integers', () => {
      const schema = int64();
      assert.throws(() => schema.parse(3.14));
    });
  });

  describe('float', () => {
    it('should create a number schema with float metadata', () => {
      const schema = float('Test float');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'float');
      assert.strictEqual(schema.__bsbMetadata.format, 'float');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test float');
    });

    it('should accept decimal numbers', () => {
      const schema = float();
      assert.doesNotThrow(() => schema.parse(3.14));
      assert.doesNotThrow(() => schema.parse(0.0));
      assert.doesNotThrow(() => schema.parse(-2.5));
    });

    it('should accept integers as floats', () => {
      const schema = float();
      assert.doesNotThrow(() => schema.parse(42));
    });
  });

  describe('double', () => {
    it('should create a number schema with double metadata', () => {
      const schema = double('Test double');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'double');
      assert.strictEqual(schema.__bsbMetadata.format, 'double');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test double');
    });

    it('should accept decimal numbers', () => {
      const schema = double();
      assert.doesNotThrow(() => schema.parse(3.141592653589793));
      assert.doesNotThrow(() => schema.parse(0.0));
      assert.doesNotThrow(() => schema.parse(-2.5));
    });
  });

  describe('uuid', () => {
    it('should create a string schema with uuid metadata', () => {
      const schema = uuid('Test UUID');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'uuid');
      assert.strictEqual(schema.__bsbMetadata.format, 'uuid');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test UUID');
    });

    it('should validate UUID format', () => {
      const schema = uuid();

      assert.doesNotThrow(() => schema.parse('550e8400-e29b-41d4-a716-446655440000'));
      assert.doesNotThrow(() => schema.parse('6ba7b810-9dad-11d1-80b4-00c04fd430c8'));

      assert.throws(() => schema.parse('not-a-uuid'));
      assert.throws(() => schema.parse('550e8400-e29b-41d4-a716'));
      assert.throws(() => schema.parse(''));
    });
  });

  describe('datetime', () => {
    it('should create a string schema with datetime metadata', () => {
      const schema = datetime('Test datetime');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'datetime');
      assert.strictEqual(schema.__bsbMetadata.format, 'date-time');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test datetime');
    });

    it('should validate ISO 8601 datetime format', () => {
      const schema = datetime();

      assert.doesNotThrow(() => schema.parse('2024-01-01T12:00:00Z'));
      assert.doesNotThrow(() => schema.parse('2024-01-01T12:00:00.000Z'));

      assert.throws(() => schema.parse('2024-01-01'));
      assert.throws(() => schema.parse('not-a-date'));
      assert.throws(() => schema.parse(''));
    });
  });

  describe('string', () => {
    it('should create a string schema with metadata', () => {
      const schema = string(1, 100, 'Test string');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'string');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test string');
    });

    it('should validate string length constraints', () => {
      const schema = string(2, 10);

      assert.doesNotThrow(() => schema.parse('ab'));
      assert.doesNotThrow(() => schema.parse('abcdefghij'));

      assert.throws(() => schema.parse('a'));
      assert.throws(() => schema.parse('abcdefghijk'));
    });

    it('should work without length constraints', () => {
      const schema = string();

      assert.doesNotThrow(() => schema.parse(''));
      assert.doesNotThrow(() => schema.parse('a'));
      assert.doesNotThrow(() => schema.parse('a'.repeat(1000)));
    });

    it('should work with only minLength', () => {
      const schema = string(5);

      assert.doesNotThrow(() => schema.parse('abcde'));
      assert.doesNotThrow(() => schema.parse('abcdef'));
      assert.throws(() => schema.parse('abcd'));
    });

    it('should work with only maxLength', () => {
      const schema = string(undefined, 5);

      assert.doesNotThrow(() => schema.parse(''));
      assert.doesNotThrow(() => schema.parse('abcde'));
      assert.throws(() => schema.parse('abcdef'));
    });
  });

  describe('boolean', () => {
    it('should create a boolean schema with metadata', () => {
      const schema = boolean('Test boolean');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'boolean');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test boolean');
    });

    it('should validate boolean values', () => {
      const schema = boolean();

      assert.doesNotThrow(() => schema.parse(true));
      assert.doesNotThrow(() => schema.parse(false));

      assert.throws(() => schema.parse('true'));
      assert.throws(() => schema.parse(1));
      assert.throws(() => schema.parse(0));
    });
  });

  describe('bytes', () => {
    it('should create a Uint8Array schema with metadata', () => {
      const schema = bytes('Test bytes');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'bytes');
      assert.strictEqual(schema.__bsbMetadata.format, 'byte');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test bytes');
    });

    it('should validate Uint8Array', () => {
      const schema = bytes();

      assert.doesNotThrow(() => schema.parse(new Uint8Array([1, 2, 3])));
      assert.doesNotThrow(() => schema.parse(new Uint8Array(0)));

      assert.throws(() => schema.parse([1, 2, 3]));
      assert.throws(() => schema.parse('bytes'));

      // Note: Buffer extends Uint8Array in Node.js, so it's valid
      assert.doesNotThrow(() => schema.parse(Buffer.from([1, 2, 3])));
    });
  });

  describe('enumType', () => {
    it('should create an enum schema with metadata', () => {
      const schema = enumType(['red', 'green', 'blue'], 'Test enum');
      assert.ok(schema.__bsbMetadata);
      assert.strictEqual(schema.__bsbMetadata.bsbType, 'enum');
      assert.strictEqual(schema.__bsbMetadata.description, 'Test enum');
    });

    it('should validate enum values', () => {
      const schema = enumType(['red', 'green', 'blue']);

      assert.doesNotThrow(() => schema.parse('red'));
      assert.doesNotThrow(() => schema.parse('green'));
      assert.doesNotThrow(() => schema.parse('blue'));

      assert.throws(() => schema.parse('yellow'));
      assert.throws(() => schema.parse(''));
      assert.throws(() => schema.parse(1));
    });
  });

  describe('Integration with Zod operations', () => {
    it('should work with .optional()', () => {
      const schema = z.object({
        id: uuid(),
        name: string(1, 100).optional(),
      });

      assert.doesNotThrow(() => schema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      }));

      assert.doesNotThrow(() => schema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test',
      }));
    });

    it('should work with .nullable()', () => {
      const schema = z.object({
        id: uuid(),
        description: string().nullable(),
      });

      assert.doesNotThrow(() => schema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        description: null,
      }));

      assert.doesNotThrow(() => schema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        description: 'Test description',
      }));
    });

    it('should work with .default()', () => {
      const schema = z.object({
        count: int32().default(0),
      });

      const result = schema.parse({});
      assert.strictEqual(result.count, 0);
    });

    it('should work in nested objects', () => {
      const schema = z.object({
        id: uuid(),
        metadata: z.object({
          createdAt: datetime(),
          priority: int32(),
          tags: z.array(string(1, 50)),
        }),
      });

      assert.doesNotThrow(() => schema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {
          createdAt: '2024-01-01T12:00:00Z',
          priority: 5,
          tags: ['tag1', 'tag2'],
        },
      }));
    });

    it('should work in arrays', () => {
      const schema = z.object({
        ids: z.array(uuid()),
        scores: z.array(int32()),
      });

      assert.doesNotThrow(() => schema.parse({
        ids: [
          '550e8400-e29b-41d4-a716-446655440000',
          '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        ],
        scores: [10, 20, 30],
      }));
    });
  });

  describe('Type metadata preservation', () => {
    it('should preserve metadata through schema composition', () => {
      const idSchema = uuid('Unique identifier');
      const composedSchema = z.object({
        id: idSchema,
      });

      const idField = (composedSchema.shape as any).id;
      assert.ok(idField.__bsbMetadata);
      assert.strictEqual(idField.__bsbMetadata.bsbType, 'uuid');
      assert.strictEqual(idField.__bsbMetadata.description, 'Unique identifier');
    });

    it('should include metadata in all type helpers', () => {
      const types = [
        int32('desc'),
        int64('desc'),
        float('desc'),
        double('desc'),
        uuid('desc'),
        datetime('desc'),
        string(1, 100, 'desc'),
        boolean('desc'),
        bytes('desc'),
        enumType(['a', 'b'], 'desc'),
      ];

      for (const type of types) {
        assert.ok(type.__bsbMetadata, 'Type should have __bsbMetadata');
        assert.ok(type.__bsbMetadata.bsbType, 'Type should have bsbType');
        assert.strictEqual(type.__bsbMetadata.description, 'desc', 'Type should preserve description');
      }
    });
  });
});
