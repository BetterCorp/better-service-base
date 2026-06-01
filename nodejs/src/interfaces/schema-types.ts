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

import * as av from 'anyvali';

export type BSBType = av.BaseSchema<any, any>;
export type InferBSBType<T extends BSBType> = av.Infer<T>;
export type AnyValiDocument = av.AnyValiDocument;

export function withDescription<T extends BSBType>(schema: T, description?: string): T {
  if (!description) {
    return schema;
  }

  const originalExport = schema.export.bind(schema);
  schema.export = ((mode?: av.ExportMode) => {
    const doc = originalExport(mode);
    doc.extensions = {
      ...doc.extensions,
      bsb: {
        ...(doc.extensions?.bsb ?? {}),
        description,
      },
    };
    return doc;
  }) as typeof schema.export;

  return schema;
}

function withNumericOptions(
  schema: BSBType & { min: (value: number) => BSBType; max: (value: number) => BSBType },
  options?: {
    min?: number;
    max?: number;
    description?: string;
  },
): BSBType {
  let next: any = schema;
  if (options?.min !== undefined) next = next.min(options.min);
  if (options?.max !== undefined) next = next.max(options.max);
  return withDescription(next as BSBType, options?.description);
}

export const bsb = {
  string(options?: {
    min?: number;
    max?: number;
    pattern?: string;
    description?: string;
  }) {
    let schema = av.string();
    if (options?.min !== undefined) schema = schema.minLength(options.min);
    if (options?.max !== undefined) schema = schema.maxLength(options.max);
    if (options?.pattern) schema = schema.pattern(options.pattern);
    return withDescription(schema, options?.description);
  },

  uuid(description?: string) {
    return withDescription(av.string().format('uuid'), description);
  },

  datetime(description?: string) {
    return withDescription(av.string().format('date-time'), description);
  },

  email(description?: string) {
    return withDescription(av.string().format('email'), description);
  },

  uri(description?: string) {
    return withDescription(av.string().format('url'), description);
  },

  url(description?: string) {
    return withDescription(av.string().format('url'), description);
  },

  int32(options?: {
    min?: number;
    max?: number;
    description?: string;
  }) {
    return withNumericOptions(av.int32(), options);
  },

  int64(options?: {
    min?: number;
    max?: number;
    description?: string;
  }) {
    return withNumericOptions(av.int64(), options);
  },

  float(options?: {
    min?: number;
    max?: number;
    description?: string;
  }) {
    return withNumericOptions(av.float32(), options);
  },

  double(options?: {
    min?: number;
    max?: number;
    description?: string;
  }) {
    return withNumericOptions(av.float64(), options);
  },

  number(options?: {
    min?: number;
    max?: number;
    description?: string;
  }) {
    return withNumericOptions(av.number(), options);
  },

  boolean(description?: string) {
    return withDescription(av.bool(), description);
  },

  bytes(description?: string) {
    return withDescription(av.unknown(), description);
  },

  array(items: BSBType, options?: {
    min?: number;
    max?: number;
    description?: string;
  }) {
    let schema = av.array(items);
    if (options?.min !== undefined) schema = schema.minItems(options.min);
    if (options?.max !== undefined) schema = schema.maxItems(options.max);
    return withDescription(schema, options?.description);
  },

  object<T extends Record<string, BSBType>>(properties: T, description?: string) {
    return withDescription(av.object(properties, { unknownKeys: 'strip' }), description);
  },

  enum(values: readonly (string | number)[], description?: string) {
    return withDescription(av.enum_(values), description);
  },

  union(types: BSBType[], description?: string) {
    if (types.length === 0) {
      return withDescription(av.unknown(), description ?? 'unknown');
    }
    return withDescription(av.union(types as [BSBType, ...BSBType[]]), description);
  },

  void() {
    return withDescription(av.unknown(), 'void');
  },

  unknown(description?: string) {
    return withDescription(av.unknown(), description);
  },

  record<K extends BSBType, V extends BSBType>(
    _keyType: K,
    valueType: V,
    description?: string,
  ) {
    return withDescription(av.record(valueType), description);
  },
};

export function optional<T extends BSBType>(type: T) {
  return av.optional(type);
}

export function nullable<T extends BSBType>(type: T) {
  return av.nullable(type);
}

export function bsbToJsonSchema(type: BSBType): AnyValiDocument {
  return type.export('extended');
}

export function exportPortableSchema(type: BSBType): AnyValiDocument {
  return type.export('extended');
}

export function importPortableSchema(document: AnyValiDocument): BSBType {
  return av.importSchema(document);
}
