/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program.
 * The commercial license allows you to use the Program in a closed-source manner,
 * including the right to create derivative works that are not subject to the terms
 * of the AGPL.
 *
 * To obtain a commercial license, please contact the copyright holders at
 * https://www.bettercorp.dev. The terms and conditions of the commercial license
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { z } from 'zod';

// ============================================================================
// BSB Type System - Pure Data Structures for Cross-Language Support
// ============================================================================

/**
 * Base interface for all BSB types.
 * These are pure data structures that can be serialized to JSON and
 * shared across different programming languages.
 */
export interface BSBTypeBase {
  /** Type discriminator for JSON serialization */
  _bsb: string;
  /** Human-readable description for documentation */
  description?: string;
  /** Whether this field is optional */
  optional?: boolean;
  /** Whether this field can be null */
  nullable?: boolean;
}

/**
 * String type with optional validation constraints.
 */
export interface BSBStringType extends BSBTypeBase {
  _bsb: 'string';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'uuid' | 'datetime' | 'email' | 'uri' | 'url';
}

/**
 * Numeric type with optional range constraints.
 */
export interface BSBNumberType extends BSBTypeBase {
  _bsb: 'number';
  numberType: 'int32' | 'int64' | 'float' | 'double';
  min?: number;
  max?: number;
}

/**
 * Boolean type.
 */
export interface BSBBooleanType extends BSBTypeBase {
  _bsb: 'boolean';
}

/**
 * Bytes type for binary data (byte arrays).
 * Maps to Uint8Array in JavaScript, byte[] in C#/Java/Go, bytes in Python.
 */
export interface BSBBytesType extends BSBTypeBase {
  _bsb: 'bytes';
}

/**
 * Array type with element type and optional size constraints.
 */
export interface BSBArrayType extends BSBTypeBase {
  _bsb: 'array';
  items: BSBType;
  minItems?: number;
  maxItems?: number;
}

/**
 * Object type with named properties.
 */
export interface BSBObjectType extends BSBTypeBase {
  _bsb: 'object';
  properties: Record<string, BSBType>;
  required: string[];
}

/**
 * Enum type with fixed string values.
 */
export interface BSBEnumType extends BSBTypeBase {
  _bsb: 'enum';
  values: string[];
}

/**
 * Union type representing one of multiple possible types.
 */
export interface BSBUnionType extends BSBTypeBase {
  _bsb: 'union';
  types: BSBType[];
}

/**
 * Union of all BSB type interfaces.
 */
export type BSBType =
  | BSBStringType
  | BSBNumberType
  | BSBBooleanType
  | BSBBytesType
  | BSBArrayType
  | BSBObjectType
  | BSBEnumType
  | BSBUnionType;

// ============================================================================
// Builder API - Fluent Interface for Creating BSB Types
// ============================================================================

/**
 * BSB type builder providing a fluent API for creating cross-language type definitions.
 *
 * @example
 * ```typescript
 * import { bsb, optional } from '@bsb/base';
 *
 * const UserSchema = bsb.object({
 *   id: bsb.uuid('User unique identifier'),
 *   name: bsb.string({ min: 1, max: 100, description: 'User full name' }),
 *   email: bsb.string({ description: 'User email address' }),
 *   age: optional(bsb.int32({ min: 0, max: 150, description: 'User age' })),
 * });
 * ```
 */
export const bsb = {
  /**
   * Create a string type with optional constraints.
   */
  string(options?: {
    min?: number;
    max?: number;
    pattern?: string;
    description?: string;
  }): BSBStringType {
    return {
      _bsb: 'string',
      minLength: options?.min,
      maxLength: options?.max,
      pattern: options?.pattern,
      description: options?.description,
    };
  },

  /**
   * Create a UUID string type (RFC 4122).
   *
   * Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   *
   * Language mappings:
   * - JavaScript/TypeScript: string
   * - C#: Guid
   * - Go: uuid.UUID
   * - Java: UUID
   */
  uuid(description?: string): BSBStringType {
    return {
      _bsb: 'string',
      format: 'uuid',
      description,
    };
  },

  /**
   * Create an ISO 8601 datetime string type.
   *
   * Format: 2024-01-01T12:00:00Z
   *
   * Language mappings:
   * - JavaScript/TypeScript: Date | string
   * - C#: DateTime
   * - Go: time.Time
   * - Java: Instant
   */
  datetime(description?: string): BSBStringType {
    return {
      _bsb: 'string',
      format: 'datetime',
      description,
    };
  },

  /**
   * Create an email address string type.
   */
  email(description?: string): BSBStringType {
    return {
      _bsb: 'string',
      format: 'email',
      description,
    };
  },

  /**
   * Create a URI string type.
   */
  uri(description?: string): BSBStringType {
    return {
      _bsb: 'string',
      format: 'uri',
      description,
    };
  },

  /**
   * Create a URL string type.
   */
  url(description?: string): BSBStringType {
    return {
      _bsb: 'string',
      format: 'url',
      description,
    };
  },

  /**
   * Create a 32-bit signed integer type.
   *
   * Range: -2,147,483,648 to 2,147,483,647
   *
   * Language mappings:
   * - JavaScript/TypeScript: number
   * - C#: int
   * - Go: int32
   * - Java: int
   */
  int32(options?: {
    min?: number;
    max?: number;
    description?: string;
  }): BSBNumberType {
    return {
      _bsb: 'number',
      numberType: 'int32',
      min: options?.min ?? -2147483648,
      max: options?.max ?? 2147483647,
      description: options?.description,
    };
  },

  /**
   * Create a 64-bit signed integer type.
   *
   * Range: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
   *
   * Note: JavaScript can only safely represent integers up to 2^53.
   *
   * Language mappings:
   * - JavaScript/TypeScript: number
   * - C#: long
   * - Go: int64
   * - Java: long
   */
  int64(options?: {
    min?: number;
    max?: number;
    description?: string;
  }): BSBNumberType {
    return {
      _bsb: 'number',
      numberType: 'int64',
      min: options?.min,
      max: options?.max,
      description: options?.description,
    };
  },

  /**
   * Create a 32-bit floating point number type.
   *
   * Language mappings:
   * - JavaScript/TypeScript: number
   * - C#: float
   * - Go: float32
   * - Java: float
   */
  float(options?: {
    min?: number;
    max?: number;
    description?: string;
  }): BSBNumberType {
    return {
      _bsb: 'number',
      numberType: 'float',
      min: options?.min,
      max: options?.max,
      description: options?.description,
    };
  },

  /**
   * Create a 64-bit floating point number type.
   *
   * Language mappings:
   * - JavaScript/TypeScript: number
   * - C#: double
   * - Go: float64
   * - Java: double
   */
  double(options?: {
    min?: number;
    max?: number;
    description?: string;
  }): BSBNumberType {
    return {
      _bsb: 'number',
      numberType: 'double',
      min: options?.min,
      max: options?.max,
      description: options?.description,
    };
  },

  /**
   * Create a boolean type.
   *
   * Language mappings:
   * - JavaScript/TypeScript: boolean
   * - C#: bool
   * - Go: bool
   * - Java: boolean
   */
  boolean(description?: string): BSBBooleanType {
    return {
      _bsb: 'boolean',
      description,
    };
  },

  /**
   * Create a bytes type for binary data.
   * Maps to:
   * - JavaScript/TypeScript: Uint8Array or Buffer
   * - C#: byte[]
   * - Go: []byte
   * - Java: byte[]
   * - Python: bytes
   */
  bytes(description?: string): BSBBytesType {
    return {
      _bsb: 'bytes',
      description,
    };
  },

  /**
   * Create an array type with element type and optional size constraints.
   *
   * @example
   * ```typescript
   * const TagsSchema = bsb.array(
   *   bsb.string({ max: 50 }),
   *   { min: 1, max: 10, description: 'List of tags' }
   * );
   * ```
   */
  array(
    items: BSBType,
    options?: {
      min?: number;
      max?: number;
      description?: string;
    }
  ): BSBArrayType {
    return {
      _bsb: 'array',
      items,
      minItems: options?.min,
      maxItems: options?.max,
      description: options?.description,
    };
  },

  /**
   * Create an object type with named properties.
   *
   * Required fields are automatically determined based on the optional flag.
   *
   * @example
   * ```typescript
   * const UserSchema = bsb.object({
   *   id: bsb.uuid('User ID'),
   *   name: bsb.string({ min: 1, max: 100, description: 'Full name' }),
   *   email: optional(bsb.email('Email address')),
   * }, 'User object');
   * ```
   */
  object<const T>(
    properties: T,
    description?: string
  ): {
    _bsb: 'object';
    properties: T;
    required: string[];
    description?: string;
    optional?: boolean;
    nullable?: boolean;
  } {
    // Compute required fields (non-optional)
    const required = Object.keys(properties as any).filter(
      (key) => (properties as any)[key].optional !== true
    );

    return {
      _bsb: 'object',
      properties,
      required,
      description,
    };
  },

  /**
   * Create an enum type with fixed string values.
   *
   * @example
   * ```typescript
   * const StatusSchema = bsb.enum(
   *   ['pending', 'in-progress', 'completed', 'failed'],
   *   'Task status'
   * );
   * ```
   */
  enum(
    values: readonly string[],
    description?: string
  ): BSBEnumType {
    return {
      _bsb: 'enum',
      values: [...values],
      description,
    };
  },

  /**
   * Create a union type representing one of multiple possible types.
   *
   * @example
   * ```typescript
   * const IdSchema = bsb.union([
   *   bsb.uuid('UUID identifier'),
   *   bsb.int32({ description: 'Numeric identifier' }),
   * ], 'Flexible identifier');
   * ```
   */
  union(
    types: BSBType[],
    description?: string
  ): BSBUnionType {
    return {
      _bsb: 'union',
      types,
      description,
    };
  },

  /**
   * Create a generic number type (defaults to double for floating point).
   * This is a convenience wrapper for double().
   */
  number(options?: {
    min?: number;
    max?: number;
    description?: string;
  }): BSBNumberType {
    return this.double(options);
  },

  /**
   * Create a void type for functions that don't return a value.
   */
  void(): BSBType {
    return this.union([], 'void');
  },

  /**
   * Create an unknown type for dynamic/any data.
   */
  unknown(description?: string): BSBType {
    return this.union([], description || 'unknown');
  },

  /**
   * Create a record/map type with string keys and a value type.
   */
  record<K extends BSBType, V extends BSBType>(
    keyType: K,
    valueType: V,
    description?: string
  ): BSBType {
    // Records are represented as objects with dynamic properties
    // For now, we'll use a union as a placeholder
    return this.union([valueType], description || 'record');
  },
};

// ============================================================================
// Type Modifiers
// ============================================================================

/**
 * Mark a type as optional.
 * Optional fields are not required in object schemas.
 *
 * @example
 * ```typescript
 * const UserSchema = bsb.object({
 *   name: bsb.string(),           // Required
 *   bio: optional(bsb.string()),  // Optional
 * });
 * ```
 */
export function optional<T extends BSBType>(type: T): T & { optional: true } {
  return { ...type, optional: true } as T & { optional: true };
}

/**
 * Mark a type as nullable.
 * Nullable fields can have null values in addition to their defined type.
 *
 * @example
 * ```typescript
 * const UserSchema = bsb.object({
 *   lastLogin: nullable(bsb.datetime('Last login time')),
 * });
 * ```
 */
export function nullable<T extends BSBType>(type: T): T {
  return { ...type, nullable: true };
}

// ============================================================================
// TypeScript Type Inference
// ============================================================================

// Depth counter for recursion limiting
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...0[]];

/**
 * Infer TypeScript type from BSB type definition with recursion depth limiting.
 * Provides compile-time type safety when using BSB schemas.
 * Limits recursion to prevent "excessively deep" errors.
 *
 * @example
 * ```typescript
 * const UserSchema = bsb.object({
 *   id: bsb.uuid(),
 *   name: bsb.string(),
 *   age: optional(bsb.int32()),
 * });
 *
 * type User = InferBSBType<typeof UserSchema>;
 * // Results in: { id: string; name: string; age?: number }
 * ```
 */
export type InferBSBType<T, Depth extends number = 10> =
  [T] extends [never] ? never :
  Depth extends 0 ? any :
  T extends BSBStringType ? string :
  T extends BSBNumberType ? number :
  T extends BSBBooleanType ? boolean :
  T extends BSBBytesType ? Uint8Array :
  T extends BSBArrayType ? InferBSBType<T['items'], Prev[Depth]>[] :
  T extends { _bsb: 'object'; properties: infer Props } ? (
    // Required properties
    {
      [K in keyof Props as Props[K] extends { optional: true } ? never : K]:
        Props[K] extends BSBType ? InferBSBType<Props[K], Prev[Depth]> : never
    } &
    // Optional properties
    {
      [K in keyof Props as Props[K] extends { optional: true } ? K : never]?:
        Props[K] extends BSBType ? InferBSBType<Props[K], Prev[Depth]> : never
    }
  ) :
  T extends BSBEnumType ? T['values'][number] :
  T extends BSBUnionType ? InferBSBType<T['types'][number], Prev[Depth]> :
  never;

// ============================================================================
// JSON Schema Conversion
// ============================================================================

/**
 * Convert BSB type to JSON Schema format.
 * Used for schema export and client code generation.
 */
export function bsbToJsonSchema(type: BSBType): any {
  const base: any = {};
  if (type.description) base.description = type.description;

  switch (type._bsb) {
    case 'string': {
      const schema: any = { ...base, type: 'string' };
      if (type.format) schema.format = type.format;
      if (type.minLength !== undefined) schema.minLength = type.minLength;
      if (type.maxLength !== undefined) schema.maxLength = type.maxLength;
      if (type.pattern) schema.pattern = type.pattern;
      return schema;
    }

    case 'number': {
      const isInteger = type.numberType === 'int32' || type.numberType === 'int64';
      const schema: any = {
        ...base,
        type: isInteger ? 'integer' : 'number',
        format: type.numberType,
      };
      if (type.min !== undefined) schema.minimum = type.min;
      if (type.max !== undefined) schema.maximum = type.max;
      return schema;
    }

    case 'boolean':
      return { ...base, type: 'boolean' };

    case 'bytes':
      return {
        ...base,
        type: 'string',
        contentEncoding: 'base64',
      };

    case 'array': {
      const schema: any = {
        ...base,
        type: 'array',
        items: bsbToJsonSchema(type.items),
      };
      if (type.minItems !== undefined) schema.minItems = type.minItems;
      if (type.maxItems !== undefined) schema.maxItems = type.maxItems;
      return schema;
    }

    case 'object': {
      const properties: any = {};
      for (const [key, value] of Object.entries(type.properties)) {
        properties[key] = bsbToJsonSchema(value);
      }
      return {
        ...base,
        type: 'object',
        properties,
        required: type.required,
      };
    }

    case 'enum':
      return {
        ...base,
        type: 'string',
        enum: type.values,
      };

    case 'union':
      return {
        ...base,
        oneOf: type.types.map(bsbToJsonSchema),
      };

    default:
      throw new Error(`Unknown BSB type: ${(type as any)._bsb}`);
  }
}

// ============================================================================
// Runtime Validation (Zod Conversion)
// ============================================================================

/**
 * Convert BSB type to Zod schema for runtime validation.
 * This is only used in Node.js plugins for runtime validation.
 * Other languages will have their own validation implementations.
 */
export function bsbToZod(type: BSBType): z.ZodTypeAny {
  switch (type._bsb) {
    case 'string': {
      let schema = z.string();
      if (type.format === 'uuid') schema = schema.uuid();
      if (type.format === 'datetime') schema = schema.datetime();
      if (type.format === 'email') schema = schema.email();
      if (type.format === 'uri' || type.format === 'url') schema = schema.url();
      if (type.minLength !== undefined) schema = schema.min(type.minLength);
      if (type.maxLength !== undefined) schema = schema.max(type.maxLength);
      if (type.pattern) schema = schema.regex(new RegExp(type.pattern));
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    case 'number': {
      let schema = z.number();
      if (type.numberType === 'int32' || type.numberType === 'int64') {
        schema = schema.int();
      }
      if (type.min !== undefined) schema = schema.min(type.min);
      if (type.max !== undefined) schema = schema.max(type.max);
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    case 'boolean': {
      let schema = z.boolean();
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    case 'bytes': {
      let schema = z.instanceof(Uint8Array);
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    case 'array': {
      let schema = z.array(bsbToZod(type.items));
      if (type.minItems !== undefined) schema = schema.min(type.minItems);
      if (type.maxItems !== undefined) schema = schema.max(type.maxItems);
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    case 'object': {
      const shape: any = {};
      for (const [key, value] of Object.entries(type.properties)) {
        shape[key] = bsbToZod(value);
      }
      let schema = z.object(shape);
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    case 'enum': {
      let schema = z.enum(type.values as any);
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    case 'union': {
      const schemas = type.types.map(bsbToZod);
      let schema = z.union(schemas as any);
      if (type.optional) return schema.optional();
      if (type.nullable) return schema.nullable();
      return schema;
    }

    default:
      throw new Error(`Unknown BSB type: ${(type as any)._bsb}`);
  }
}
