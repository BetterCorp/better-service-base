/**
 * Tests for PluginConfig.ts - v9 createConfigSchema helper
 */

import { describe, it } from 'mocha';
import * as assert from 'assert';
import { z } from 'zod';
import { createConfigSchema, BSBPluginConfig } from '../../base/PluginConfig';

describe('PluginConfig v9', () => {
  describe('createConfigSchema', () => {
    it('should create a config class with metadata', () => {
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin description',
        },
        z.object({
          setting: z.string(),
        })
      );

      assert.ok(Config);
      assert.ok(Config.metadata);
      assert.strictEqual(Config.metadata.name, 'test-plugin');
      assert.strictEqual(Config.metadata.description, 'Test plugin description');
    });

    it('should create a config class that extends BSBPluginConfig', () => {
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin description',
        },
        z.object({
          setting: z.string(),
        })
      );

      const instance = new Config();
      assert.ok(instance instanceof BSBPluginConfig);
    });

    it('should set validationSchema on config class', () => {
      const schema = z.object({
        setting: z.string(),
      });

      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin description',
        },
        schema
      );

      const instance = new Config();
      assert.strictEqual(instance.validationSchema, schema);
    });

    it('should support omitted schema (no config)', () => {
      const Config = createConfigSchema(
        {
          name: 'test-no-config',
          description: 'Test plugin without config schema',
        }
      );

      const instance = new Config();
      assert.strictEqual(instance.validationSchema, undefined);
      assert.strictEqual(Config.metadata.name, 'test-no-config');
    });

    it('should support full metadata fields', () => {
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin description',
          version: '2.0.0',
          author: 'Test Author',
          license: 'MIT',
          homepage: 'https://example.com',
          repository: 'https://github.com/example/test',
          category: 'service',
          tags: ['test', 'example'],
        },
        z.null()
      );

      assert.strictEqual(Config.metadata.name, 'test-plugin');
      assert.strictEqual(Config.metadata.description, 'Test plugin description');
      assert.strictEqual(Config.metadata.version, '2.0.0');
      assert.strictEqual(Config.metadata.author, 'Test Author');
      assert.strictEqual(Config.metadata.license, 'MIT');
      assert.strictEqual(Config.metadata.homepage, 'https://example.com');
      assert.strictEqual(Config.metadata.repository, 'https://github.com/example/test');
      assert.strictEqual(Config.metadata.category, 'service');
      assert.ok(Array.isArray(Config.metadata.tags));
      assert.strictEqual(Config.metadata.tags?.length, 2);
    });

    it('should support plugin dependencies', () => {
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin description',
          initBeforePlugins: ['plugin-a'],
          initAfterPlugins: ['plugin-b', 'plugin-c'],
          runBeforePlugins: ['plugin-d'],
          runAfterPlugins: ['plugin-e'],
        },
        z.null()
      );

      assert.ok(Array.isArray(Config.metadata.initBeforePlugins));
      assert.strictEqual(Config.metadata.initBeforePlugins?.length, 1);
      assert.strictEqual(Config.metadata.initBeforePlugins?.[0], 'plugin-a');

      assert.ok(Array.isArray(Config.metadata.initAfterPlugins));
      assert.strictEqual(Config.metadata.initAfterPlugins?.length, 2);

      assert.ok(Array.isArray(Config.metadata.runBeforePlugins));
      assert.strictEqual(Config.metadata.runBeforePlugins?.length, 1);

      assert.ok(Array.isArray(Config.metadata.runAfterPlugins));
      assert.strictEqual(Config.metadata.runAfterPlugins?.length, 1);
    });

    it('should work with null schema', () => {
      const schema = z.null();
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin with no config',
        },
        schema
      );

      const instance = new Config();
      assert.strictEqual(instance.validationSchema, schema);
    });

    it('should work with complex schemas', () => {
      const schema = z.object({
        connection: z.object({
          host: z.string(),
          port: z.number().int().min(1).max(65535),
        }),
        options: z.object({
          timeout: z.number().optional(),
          retries: z.number().int().min(0).default(3),
        }).optional(),
        tags: z.array(z.string()).default([]),
      });

      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin with complex config',
        },
        schema
      );

      const instance = new Config();
      assert.strictEqual(instance.validationSchema, schema);
    });

    it('should have metadata on both class and instance', () => {
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin description',
        },
        z.null()
      );

      assert.ok(Config.metadata);
      assert.strictEqual(Config.metadata.name, 'test-plugin');

      const instance = new Config();
      assert.ok(instance.metadata);
      assert.strictEqual(instance.metadata?.name, 'test-plugin');
    });

    it('should create unique config classes', () => {
      const Config1 = createConfigSchema(
        {
          name: 'plugin-1',
          description: 'Plugin 1',
        },
        z.object({ value: z.string() })
      );

      const Config2 = createConfigSchema(
        {
          name: 'plugin-2',
          description: 'Plugin 2',
        },
        z.object({ count: z.number() })
      );

      assert.notStrictEqual(Config1, Config2);
      assert.notStrictEqual(Config1.metadata, Config2.metadata);
      assert.strictEqual(Config1.metadata.name, 'plugin-1');
      assert.strictEqual(Config2.metadata.name, 'plugin-2');
    });

    it('should support category enum values', () => {
      const categories: Array<'service' | 'observable' | 'events' | 'config' | 'other'> = [
        'service',
        'observable',
        'events',
        'config',
        'other',
      ];

      for (const category of categories) {
        const Config = createConfigSchema(
          {
            name: `test-${category}`,
            description: `Test ${category} plugin`,
            category,
          },
          z.null()
        );

        assert.strictEqual(Config.metadata.category, category);
      }
    });

    it('should validate required metadata fields', () => {
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin',
        },
        z.null()
      );

      assert.ok(Config.metadata.name);
      assert.ok(Config.metadata.description);
    });

    it('should handle empty optional arrays', () => {
      const Config = createConfigSchema(
        {
          name: 'test-plugin',
          description: 'Test plugin',
          tags: [],
          initBeforePlugins: [],
        },
        z.null()
      );

      assert.ok(Array.isArray(Config.metadata.tags));
      assert.strictEqual(Config.metadata.tags?.length, 0);
      assert.ok(Array.isArray(Config.metadata.initBeforePlugins));
      assert.strictEqual(Config.metadata.initBeforePlugins?.length, 0);
    });
  });
});
