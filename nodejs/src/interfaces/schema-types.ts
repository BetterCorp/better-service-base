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

/**
 * Type metadata for cross-language support.
 * This metadata is embedded in Zod schemas and exported to JSON Schema
 * with 'x-bsb-type' and 'format' hints for client code generators.
 */
export interface TypeMetadata {
  /** BSB type identifier (e.g., "int32", "uuid", "datetime") */
  bsbType: string;
  /** JSON Schema format hint (e.g., "int32", "uuid", "date-time") */
  format?: string;
  /** Description for documentation and code generation */
  description?: string;
}

/**
 * Extended Zod schema with BSB type metadata for cross-language support.
 * The metadata is used during schema export to provide type hints for
 * code generators in other languages (C#, Go, Java, etc.).
 */
export type BSBType<T extends z.ZodTypeAny> = T & {
  /** Internal metadata for BSB type system */
  __bsbMetadata: TypeMetadata;
};

// ============================================================================
// Numeric Types
// ============================================================================

/**
 * 32-bit signed integer with validation.
 *
 * Language mappings:
 * - JavaScript/TypeScript: number
 * - C#: int
 * - Go: int32
 * - Java: int
 * - Range: -2,147,483,648 to 2,147,483,647
 *
 * @param description - Optional description for documentation
 * @returns Zod number schema with int32 type metadata
 *
 * @example
 * ```typescript
 * const UserSchema = z.object({
 *   age: int32('User age in years'),
 *   priority: int32('Priority level (1-5)'),
 * });
 * ```
 */
export function int32(description?: string): BSBType<z.ZodNumber> {
  const schema = z.number().int().min(-2147483648).max(2147483647);
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'int32',
      format: 'int32',
      description,
    },
  });
}

/**
 * 64-bit signed integer with validation.
 *
 * Language mappings:
 * - JavaScript/TypeScript: number (may lose precision beyond 2^53)
 * - C#: long
 * - Go: int64
 * - Java: long
 * - Range: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
 *
 * Note: JavaScript numbers are 64-bit floats and can only safely represent
 * integers up to 2^53. For values beyond this, consider using string representation.
 *
 * @param description - Optional description for documentation
 * @returns Zod number schema with int64 type metadata
 *
 * @example
 * ```typescript
 * const MetricsSchema = z.object({
 *   timestamp: int64('Unix timestamp in milliseconds'),
 *   fileSize: int64('File size in bytes'),
 * });
 * ```
 */
export function int64(description?: string): BSBType<z.ZodNumber> {
  const schema = z.number().int();
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'int64',
      format: 'int64',
      description,
    },
  });
}

/**
 * 32-bit floating point number.
 *
 * Language mappings:
 * - JavaScript/TypeScript: number
 * - C#: float
 * - Go: float32
 * - Java: float
 *
 * @param description - Optional description for documentation
 * @returns Zod number schema with float type metadata
 *
 * @example
 * ```typescript
 * const SensorSchema = z.object({
 *   temperature: float('Temperature in Celsius'),
 *   humidity: float('Relative humidity percentage'),
 * });
 * ```
 */
export function float(description?: string): BSBType<z.ZodNumber> {
  const schema = z.number();
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'float',
      format: 'float',
      description,
    },
  });
}

/**
 * 64-bit floating point number.
 *
 * Language mappings:
 * - JavaScript/TypeScript: number
 * - C#: double
 * - Go: float64
 * - Java: double
 *
 * @param description - Optional description for documentation
 * @returns Zod number schema with double type metadata
 *
 * @example
 * ```typescript
 * const CoordinateSchema = z.object({
 *   latitude: double('Latitude coordinate'),
 *   longitude: double('Longitude coordinate'),
 * });
 * ```
 */
export function double(description?: string): BSBType<z.ZodNumber> {
  const schema = z.number();
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'double',
      format: 'double',
      description,
    },
  });
}

// ============================================================================
// String Types
// ============================================================================

/**
 * UUID (Universally Unique Identifier) string with validation.
 *
 * Language mappings:
 * - JavaScript/TypeScript: string
 * - C#: Guid
 * - Go: uuid.UUID
 * - Java: UUID
 * - Format: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 *
 * @param description - Optional description for documentation
 * @returns Zod string schema with UUID validation and type metadata
 *
 * @example
 * ```typescript
 * const TodoSchema = z.object({
 *   id: uuid('Unique todo identifier'),
 *   userId: uuid('Owner user ID'),
 * });
 * ```
 */
export function uuid(description?: string): BSBType<z.ZodString> {
  const schema = z.string().uuid();
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'uuid',
      format: 'uuid',
      description,
    },
  });
}

/**
 * ISO 8601 datetime string with validation.
 *
 * Language mappings:
 * - JavaScript/TypeScript: Date | string
 * - C#: DateTime
 * - Go: time.Time
 * - Java: Instant
 * - Format: "2024-01-01T12:00:00Z" (ISO 8601)
 *
 * @param description - Optional description for documentation
 * @returns Zod string schema with datetime validation and type metadata
 *
 * @example
 * ```typescript
 * const EventSchema = z.object({
 *   createdAt: datetime('Creation timestamp'),
 *   updatedAt: datetime('Last update timestamp'),
 * });
 * ```
 */
export function datetime(description?: string): BSBType<z.ZodString> {
  const schema = z.string().datetime();
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'datetime',
      format: 'date-time',
      description,
    },
  });
}

/**
 * String with optional length constraints.
 *
 * Language mappings:
 * - JavaScript/TypeScript: string
 * - C#: string
 * - Go: string
 * - Java: String
 *
 * @param minLength - Optional minimum length
 * @param maxLength - Optional maximum length
 * @param description - Optional description for documentation
 * @returns Zod string schema with validation and type metadata
 *
 * @example
 * ```typescript
 * const UserSchema = z.object({
 *   username: string(3, 20, 'Username (3-20 characters)'),
 *   email: string(undefined, 255, 'Email address'),
 *   bio: string(0, 1000, 'User biography'),
 * });
 * ```
 */
export function string(
  minLength?: number,
  maxLength?: number,
  description?: string
): BSBType<z.ZodString> {
  let schema = z.string();
  if (minLength !== undefined) schema = schema.min(minLength);
  if (maxLength !== undefined) schema = schema.max(maxLength);
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'string',
      description,
    },
  });
}

// ============================================================================
// Other Types
// ============================================================================

/**
 * Boolean type.
 *
 * Language mappings:
 * - JavaScript/TypeScript: boolean
 * - C#: bool
 * - Go: bool
 * - Java: boolean
 *
 * @param description - Optional description for documentation
 * @returns Zod boolean schema with type metadata
 *
 * @example
 * ```typescript
 * const TodoSchema = z.object({
 *   completed: boolean('Whether the todo is completed'),
 *   archived: boolean('Whether the todo is archived'),
 * });
 * ```
 */
export function boolean(description?: string): BSBType<z.ZodBoolean> {
  const schema = z.boolean();
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'boolean',
      description,
    },
  });
}

/**
 * Byte array for binary data.
 *
 * Language mappings:
 * - JavaScript/TypeScript: Uint8Array
 * - C#: byte[]
 * - Go: []byte
 * - Java: byte[]
 * - JSON: base64 encoded string
 *
 * @param description - Optional description for documentation
 * @returns Zod schema with byte array type metadata
 *
 * @example
 * ```typescript
 * const FileSchema = z.object({
 *   content: bytes('File binary content'),
 *   thumbnail: bytes('Image thumbnail data'),
 * });
 * ```
 */
export function bytes(description?: string): BSBType<z.ZodType<Uint8Array>> {
  const schema = z.instanceof(Uint8Array);
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'bytes',
      format: 'byte',
      description,
    },
  });
}

/**
 * Enum type with fixed set of string values.
 *
 * Language mappings:
 * - JavaScript/TypeScript: string literal union
 * - C#: enum
 * - Go: const values
 * - Java: enum
 *
 * @param values - Array of allowed string values (must have at least 1 value)
 * @param description - Optional description for documentation
 * @returns Zod enum schema with type metadata
 *
 * @example
 * ```typescript
 * const TodoSchema = z.object({
 *   status: enumType(['pending', 'in-progress', 'completed'] as const, 'Todo status'),
 *   priority: enumType(['low', 'medium', 'high'] as const, 'Priority level'),
 * });
 * ```
 */
export function enumType<T extends readonly [string, ...string[]]>(
  values: T,
  description?: string
): BSBType<z.ZodEnum<any>> {
  const schema = z.enum(values as any);
  return Object.assign(schema, {
    __bsbMetadata: {
      bsbType: 'enum',
      description,
    },
  }) as any;
}
