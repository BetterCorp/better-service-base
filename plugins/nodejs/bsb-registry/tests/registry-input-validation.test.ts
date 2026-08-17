import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ListQuerySchema,
  PublishRequestSchema,
  majorMinorVersion,
  packageLookupId,
  registryIdentifier,
  registryPluginId,
  semanticVersion,
} from '../src/plugins/service-bsb-registry/types.js';

test('registry identifiers reject filesystem path components', () => {
  const schema = registryIdentifier('Registry identifier');

  for (const value of ['.', '..', '@', '.hidden', '-plugin', '../outside', 'org/plugin', 'org\\plugin', '%2F']) {
    assert.equal(schema.safeParse(value).success, false, `${value} must be rejected`);
  }

  for (const value of ['_', '@bsb', 'service-config-vault', 'plugin.name']) {
    assert.equal(schema.safeParse(value).success, true, `${value} must remain valid`);
  }
});

test('plugin IDs allow one safe namespace separator only', () => {
  const schema = registryPluginId('Plugin ID');

  for (const value of ['../plugin', 'org/../plugin', 'org/..', 'org\\plugin', 'org/name/extra']) {
    assert.equal(schema.safeParse(value).success, false, `${value} must be rejected`);
  }

  for (const value of ['service-config-vault', '_/service-config-vault', '@bsb/registry']) {
    assert.equal(schema.safeParse(value).success, true, `${value} must remain valid`);
  }
});

test('package lookup IDs reject traversal while preserving language package formats', () => {
  const schema = packageLookupId('Package lookup ID');

  for (const value of ['../secret', 'github.com/acme/../secret', 'org\\package', 'org//package']) {
    assert.equal(schema.safeParse(value).success, false, `${value} must be rejected`);
  }

  for (const value of ['@bsb/registry', 'github.com/acme/plugin', 'BetterCorp.Registry', 'com.bettercorp:registry']) {
    assert.equal(schema.safeParse(value).success, true, `${value} must remain valid`);
  }
});

test('registry version inputs use their exact formats', () => {
  const semver = semanticVersion('Semantic version');
  const majorMinor = majorMinorVersion('Major.minor version');

  assert.equal(semver.safeParse('1.2.3').success, true);
  assert.equal(semver.safeParse('../../1.2.3').success, false);
  assert.equal(majorMinor.safeParse('1.2').success, true);
  assert.equal(majorMinor.safeParse('1.2 || anything').success, false);
});

test('core publish and list requests enforce registry identifiers', () => {
  const publishRequest = {
    org: 'safe-org',
    name: 'safe-plugin',
    version: '1.0.0',
    language: 'nodejs',
    metadata: {
      displayName: 'Safe plugin',
      description: 'Safe plugin description',
      category: 'service',
      tags: [],
    },
    eventSchema: {},
    documentation: ['# Safe plugin'],
  };

  assert.equal(PublishRequestSchema.safeParse(publishRequest).success, true);
  assert.equal(PublishRequestSchema.safeParse({ ...publishRequest, org: '..' }).success, false);
  assert.equal(PublishRequestSchema.safeParse({ ...publishRequest, name: '../outside' }).success, false);
  assert.equal(ListQuerySchema.safeParse({ org: '..' }).success, false);
});
