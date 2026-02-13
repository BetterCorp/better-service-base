/**
 * Tests for schema-types.ts - Cross-language type system
 */

import { describe, it } from 'mocha';
import * as assert from 'assert';
import { z } from 'zod';
import { bsb, bsbToZod, optional } from '../../interfaces/schema-types';

describe('schema-types - Cross-language type system', () => {
  describe('int32', () => {
    it('should create a number schema with int32 metadata', () => {
      const bsbType = bsb.int32({ description: 'Test integer' });
      assert.strictEqual(bsbType._bsb, 'number');
      assert.strictEqual(bsbType.numberType, 'int32');
      assert.strictEqual(bsbType.description, 'Test integer');
    });

    it('should validate 32-bit integer range', () => {
      const bsbType = bsb.int32();
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse(0));
      assert.doesNotThrow(() => schema.parse(2147483647));
      assert.doesNotThrow(() => schema.parse(-2147483648));

      assert.throws(() => schema.parse(2147483648));
      assert.throws(() => schema.parse(-2147483649));
    });

    it('should reject non-integers', () => {
      const bsbType = bsb.int32();
      const schema = bsbToZod(bsbType);
      assert.throws(() => schema.parse(3.14));
      assert.throws(() => schema.parse('123'));
    });
  });

  describe('int64', () => {
    it('should create a number schema with int64 metadata', () => {
      const bsbType = bsb.int64({ description: 'Test long' });
      assert.strictEqual(bsbType._bsb, 'number');
      assert.strictEqual(bsbType.numberType, 'int64');
      assert.strictEqual(bsbType.description, 'Test long');
    });

    it('should validate 64-bit integer range', () => {
      const bsbType = bsb.int64();
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse(0));
      assert.doesNotThrow(() => schema.parse(9007199254740991)); // Max safe integer in JS
      assert.doesNotThrow(() => schema.parse(-9007199254740991));
    });

    it('should reject non-integers', () => {
      const bsbType = bsb.int64();
      const schema = bsbToZod(bsbType);
      assert.throws(() => schema.parse(3.14));
    });
  });

  describe('float', () => {
    it('should create a number schema with float metadata', () => {
      const bsbType = bsb.float({ description: 'Test float' });
      assert.strictEqual(bsbType._bsb, 'number');
      assert.strictEqual(bsbType.numberType, 'float');
      assert.strictEqual(bsbType.description, 'Test float');
    });

    it('should accept decimal numbers', () => {
      const bsbType = bsb.float();
      const schema = bsbToZod(bsbType);
      assert.doesNotThrow(() => schema.parse(3.14));
      assert.doesNotThrow(() => schema.parse(0.0));
      assert.doesNotThrow(() => schema.parse(-2.5));
    });

    it('should accept integers as floats', () => {
      const bsbType = bsb.float();
      const schema = bsbToZod(bsbType);
      assert.doesNotThrow(() => schema.parse(42));
    });
  });

  describe('double', () => {
    it('should create a number schema with double metadata', () => {
      const bsbType = bsb.double({ description: 'Test double' });
      assert.strictEqual(bsbType._bsb, 'number');
      assert.strictEqual(bsbType.numberType, 'double');
      assert.strictEqual(bsbType.description, 'Test double');
    });

    it('should accept decimal numbers', () => {
      const bsbType = bsb.double();
      const schema = bsbToZod(bsbType);
      assert.doesNotThrow(() => schema.parse(3.141592653589793));
      assert.doesNotThrow(() => schema.parse(0.0));
      assert.doesNotThrow(() => schema.parse(-2.5));
    });
  });

  describe('uuid', () => {
    it('should create a string schema with uuid metadata', () => {
      const bsbType = bsb.uuid('Test UUID');
      assert.strictEqual(bsbType._bsb, 'string');
      assert.strictEqual(bsbType.format, 'uuid');
      assert.strictEqual(bsbType.description, 'Test UUID');
    });

    it('should validate UUID format', () => {
      const bsbType = bsb.uuid();
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse('550e8400-e29b-41d4-a716-446655440000'));
      assert.doesNotThrow(() => schema.parse('6ba7b810-9dad-11d1-80b4-00c04fd430c8'));

      assert.throws(() => schema.parse('not-a-uuid'));
      assert.throws(() => schema.parse('550e8400-e29b-41d4-a716'));
      assert.throws(() => schema.parse(''));
    });
  });

  describe('datetime', () => {
    it('should create a string schema with datetime metadata', () => {
      const bsbType = bsb.datetime('Test datetime');
      assert.strictEqual(bsbType._bsb, 'string');
      assert.strictEqual(bsbType.format, 'datetime');
      assert.strictEqual(bsbType.description, 'Test datetime');
    });

    it('should validate ISO 8601 datetime format', () => {
      const bsbType = bsb.datetime();
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse('2024-01-01T12:00:00Z'));
      assert.doesNotThrow(() => schema.parse('2024-01-01T12:00:00.000Z'));

      assert.throws(() => schema.parse('2024-01-01'));
      assert.throws(() => schema.parse('not-a-date'));
      assert.throws(() => schema.parse(''));
    });
  });

  describe('string', () => {
    it('should create a string schema with metadata', () => {
      const bsbType = bsb.string({ min: 1, max: 100, description: 'Test string' });
      assert.strictEqual(bsbType._bsb, 'string');
      assert.strictEqual(bsbType.minLength, 1);
      assert.strictEqual(bsbType.maxLength, 100);
      assert.strictEqual(bsbType.description, 'Test string');
    });

    it('should validate string length constraints', () => {
      const bsbType = bsb.string({ min: 2, max: 10 });
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse('ab'));
      assert.doesNotThrow(() => schema.parse('abcdefghij'));

      assert.throws(() => schema.parse('a'));
      assert.throws(() => schema.parse('abcdefghijk'));
    });

    it('should work without length constraints', () => {
      const bsbType = bsb.string();
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse(''));
      assert.doesNotThrow(() => schema.parse('a'));
      assert.doesNotThrow(() => schema.parse('a'.repeat(1000)));
    });

    it('should work with only minLength', () => {
      const bsbType = bsb.string({ min: 5 });
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse('abcde'));
      assert.doesNotThrow(() => schema.parse('abcdef'));
      assert.throws(() => schema.parse('abcd'));
    });

    it('should work with only maxLength', () => {
      const bsbType = bsb.string({ max: 5 });
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse(''));
      assert.doesNotThrow(() => schema.parse('abcde'));
      assert.throws(() => schema.parse('abcdef'));
    });
  });

  describe('boolean', () => {
    it('should create a boolean schema with metadata', () => {
      const bsbType = bsb.boolean('Test boolean');
      assert.strictEqual(bsbType._bsb, 'boolean');
      assert.strictEqual(bsbType.description, 'Test boolean');
    });

    it('should validate boolean values', () => {
      const bsbType = bsb.boolean();
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse(true));
      assert.doesNotThrow(() => schema.parse(false));

      assert.throws(() => schema.parse('true'));
      assert.throws(() => schema.parse(1));
      assert.throws(() => schema.parse(0));
    });
  });

  describe('bytes', () => {
    it('should create a Uint8Array schema with metadata', () => {
      const bsbType = bsb.bytes('Test bytes');
      assert.strictEqual(bsbType._bsb, 'bytes');
      assert.strictEqual(bsbType.description, 'Test bytes');
    });

    it('should validate Uint8Array', () => {
      const bsbType = bsb.bytes();
      const schema = bsbToZod(bsbType);

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
      const bsbType = bsb.enum(['red', 'green', 'blue'], 'Test enum');
      assert.strictEqual(bsbType._bsb, 'enum');
      assert.deepStrictEqual(bsbType.values, ['red', 'green', 'blue']);
      assert.strictEqual(bsbType.description, 'Test enum');
    });

    it('should validate enum values', () => {
      const bsbType = bsb.enum(['red', 'green', 'blue']);
      const schema = bsbToZod(bsbType);

      assert.doesNotThrow(() => schema.parse('red'));
      assert.doesNotThrow(() => schema.parse('green'));
      assert.doesNotThrow(() => schema.parse('blue'));

      assert.throws(() => schema.parse('yellow'));
      assert.throws(() => schema.parse(''));
      assert.throws(() => schema.parse(1));
    });
  });

  describe('Integration with Zod operations', () => {
    it('should work in Zod object schemas', () => {
      const UserSchema = z.object({
        id: bsbToZod(bsb.uuid('User ID')),
        name: z.string(),
      });

      assert.doesNotThrow(() =>
        UserSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'John',
        })
      );

      assert.throws(() =>
        UserSchema.parse({
          id: 'not-a-uuid',
          name: 'John',
        })
      );
    });

    it('should support optional fields', () => {
      const ProfileSchema = z.object({
        id: bsbToZod(bsb.uuid()),
        bio: bsbToZod(optional(bsb.string({ max: 500 }))),
      });

      assert.doesNotThrow(() =>
        ProfileSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
        })
      );

      assert.doesNotThrow(() =>
        ProfileSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          bio: 'Hello world',
        })
      );
    });

    it('should support nested objects with mixed types', () => {
      const OrderSchema = z.object({
        id: bsbToZod(bsb.uuid()),
        amount: bsbToZod(bsb.int32({ min: 0 })),
        items: z.array(
          z.object({
            id: bsbToZod(bsb.uuid()),
            quantity: bsbToZod(bsb.int32({ min: 1 })),
          })
        ),
      });

      assert.doesNotThrow(() =>
        OrderSchema.parse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 100,
          items: [
            {
              id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              quantity: 2,
            },
          ],
        })
      );
    });

    it('should support refinements and transformations', () => {
      const schema = bsbToZod(bsb.uuid())
        .refine((val) => val.startsWith('550e'), {
          message: 'Must start with 550e',
        });

      assert.doesNotThrow(() => schema.parse('550e8400-e29b-41d4-a716-446655440000'));
      assert.throws(() => schema.parse('6ba7b810-9dad-11d1-80b4-00c04fd430c8'));
    });

    it('should support array operations', () => {
      const TagsSchema = z.object({
        tags: z.array(bsbToZod(bsb.string({ min: 1, max: 20 }))),
        scores: z.array(bsbToZod(bsb.int32({ min: 0, max: 100 }))),
      });

      assert.doesNotThrow(() =>
        TagsSchema.parse({
          tags: ['typescript', 'nodejs'],
          scores: [95, 87, 100],
        })
      );

      assert.throws(() =>
        TagsSchema.parse({
          tags: ['a'.repeat(21)], // Too long
          scores: [10, 20, 30],
        })
      );
    });
  });

  describe('Type metadata preservation', () => {
    it('should preserve metadata through BSB type operations', () => {
      const idType = bsb.uuid('Unique identifier');

      assert.strictEqual(idType._bsb, 'string');
      assert.strictEqual(idType.format, 'uuid');
      assert.strictEqual(idType.description, 'Unique identifier');
    });

    it('should preserve metadata for numeric types', () => {
      const ageType = bsb.int32({ min: 0, max: 120, description: 'Age in years' });

      assert.strictEqual(ageType._bsb, 'number');
      assert.strictEqual(ageType.numberType, 'int32');
      assert.strictEqual(ageType.min, 0);
      assert.strictEqual(ageType.max, 120);
      assert.strictEqual(ageType.description, 'Age in years');
    });
  });
});
