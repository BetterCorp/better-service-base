import * as av from 'anyvali';
import { createError, type H3Event } from 'h3';

const uuidPattern = '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$';
const slugPattern = '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$';
const orgPattern = '^(_|@?[A-Za-z0-9][A-Za-z0-9._-]{0,99})$';
const packagePattern = '^(@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$';
const semverPattern = '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$';
const tokenPattern = '^[A-Za-z0-9_-]{1,512}$';

const text = (max: number) => av.string().maxLength(max);
const requiredText = (max: number) => text(max).minLength(1);
const uuid = av.string().maxLength(64).pattern(uuidPattern);
const slug = av.string().maxLength(100).pattern(slugPattern);
const org = av.string().maxLength(100).pattern(orgPattern);
const packageName = av.string().maxLength(214).pattern(packagePattern);
const semver = av.string().maxLength(128).pattern(semverPattern);
const token = av.string().maxLength(512).pattern(tokenPattern);
const totp = av.string().maxLength(6).pattern('^\\d{6}$');
const checkbox = av.optional(av.union([av.bool(), av.enum_(['on', 'true', 'false', '1', '0'] as const)]));
const jsonObject = av.record(av.unknown());
const jsonObjectInput = av.union([jsonObject, av.string().maxLength(1024 * 1024)]);
const stringArrayJson = av.string().maxLength(64 * 1024);
const optionalText = (max: number) => av.optional(text(max));
const optionalUuid = av.optional(uuid);
const optionalSlug = av.optional(slug);
const optionalJsonObject = av.optional(jsonObject);
const optionalJsonObjectInput = av.optional(jsonObjectInput);
const strict = <T extends Record<string, av.SchemaAny>>(shape: T) => av.object(shape).unknownKeys('reject');
const privatePluginUpload = av.union([
  strict({ org, packageName, schemaFileName: requiredText(105), schema: jsonObject, replace: checkbox }),
  strict({ org: av.optional(org), packageName: av.optional(packageName), manifestFileName: requiredText(105), manifest: jsonObject, replace: checkbox }),
]);

const pluginConfig = {
  section: av.enum_(['services', 'events', 'observable'] as const),
  name: slug,
  plugin: slug,
  packageName: optionalText(214),
  version: optionalText(128),
  enabled: checkbox,
  config: optionalJsonObjectInput,
  sensitiveClearPaths: av.optional(stringArrayJson),
};

export const requestSchemas: Readonly<Record<string, av.SchemaAny>> = {
  '/setup': strict({ setupCode: token, email: av.string().maxLength(254).format('email'), password: requiredText(1024), passwordConfirm: requiredText(1024) }),
  '/user-setup/exchange': strict({ token }),
  '/user-setup/start': strict({ password: requiredText(1024), passwordConfirm: requiredText(1024), label: requiredText(100) }),
  '/user-setup/totp': strict({ methodId: uuid, totpCode: totp }),
  '/user-setup/passkey': strict({ credential: jsonObject }),
  '/login/start': strict({ email: av.string().maxLength(254).format('email'), password: text(1024), totpCode: av.optional(totp) }),
  '/login/finish': strict({ challengeId: token, credential: jsonObject }),
  '/login/totp': strict({ totpToken: token, totpCode: totp }),
  '/api/passkeys/register/verify': strict({ credential: jsonObject }),
  '/api/applications/update': strict({ id: uuid, name: requiredText(100), description: optionalText(1000) }),
  '/api/applications/delete': strict({ id: uuid }),
  '/api/applications': strict({ name: requiredText(100), description: optionalText(1000) }),
  '/api/groups/update': strict({ id: uuid, applicationId: uuid, name: requiredText(100) }),
  '/api/groups/delete': strict({ id: uuid }),
  '/api/groups': strict({ applicationId: uuid, name: requiredText(100) }),
  '/api/profiles/update': strict({ id: uuid, groupId: uuid, name: slug }),
  '/api/profiles/delete': strict({ id: uuid }),
  '/api/profiles': strict({ groupId: uuid, name: slug }),
  '/api/plugins/publish': strict({
    org,
    name: slug,
    version: semver,
    language: av.optional(av.literal('nodejs')),
    metadata: optionalJsonObject,
    package: optionalJsonObject,
    packageName: av.optional(packageName),
    eventSchema: jsonObject,
    configSchema: av.optional(av.nullable(jsonObject)),
    dependencies: av.optional(av.array(jsonObject).maxItems(1000)),
  }),
  '/api/plugins/publish-key/rotate': strict({ pluginId: slug }),
  '/api/plugins/publish-key/enable': strict({ pluginId: slug }),
  '/api/plugins/import': strict({ org, name: slug, pluginId: requiredText(201), packageName: optionalText(214), version: semver, kind: av.enum_(['service', 'events', 'observable', 'config'] as const), configSchema: optionalJsonObjectInput, eventSchema: optionalJsonObjectInput }),
  '/api/plugins/delete': strict({ id: uuid }),
  '/api/plugins': privatePluginUpload,
  '/api/drafts': strict({ profileId: uuid, config: jsonObjectInput }),
  '/api/publish': strict({ profileId: uuid }),
  '/api/application-profile-plugins/delete': strict({ applicationProfileId: uuid, section: pluginConfig.section, name: slug }),
  '/api/application-profile-plugins': strict({ applicationProfileId: uuid, ...pluginConfig }),
  '/api/application-profile-publish': strict({ applicationProfileId: uuid }),
  '/api/profile-plugins/delete': strict({ profileId: uuid, section: pluginConfig.section, name: slug }),
  '/api/profile-plugins/copy': strict({ sourceProfileId: uuid, targetProfileId: uuid, section: pluginConfig.section, name: slug, overwrite: checkbox }),
  '/api/profile-plugins': strict({ profileId: uuid, ...pluginConfig, allowEnvOverrides: checkbox, baseEnabled: checkbox, baseConfig: optionalJsonObjectInput, overridePaths: av.optional(stringArrayJson) }),
  '/api/runtime-keys/rotate': strict({ keyId: av.string().maxLength(64).pattern('^vk_[A-Za-z0-9_-]+$'), name: optionalText(100) }),
  '/api/runtime-keys': strict({ name: requiredText(100), profileId: uuid, containerName: optionalText(255) }),
  '/api/users/deactivate': strict({ userId: uuid }),
  '/api/users/reset': strict({ userId: uuid }),
  '/api/users': strict({ email: av.string().maxLength(254).format('email') }),
  '/api/auth-methods/start': strict({ label: requiredText(100) }),
  '/api/auth-methods/totp': strict({ methodId: uuid, totpCode: totp }),
  '/api/auth-methods/delete': strict({ methodId: uuid }),
};

const largeBodyPaths = new Set([
  '/api/plugins/publish',
  '/api/plugins/import',
  '/api/plugins',
  '/api/drafts',
  '/api/application-profile-plugins',
  '/api/profile-plugins',
]);

export function bodyLimit(pathname: string): number {
  return largeBodyPaths.has(pathname) ? 1024 * 1024 : 16 * 1024;
}

export async function readAndValidateBody(event: H3Event, pathname: string): Promise<Record<string, unknown>> {
  const schema = requestSchemas[pathname];
  const raw = await readBoundedBody(event, bodyLimit(pathname));
  if (!schema) {
    if (Object.keys(raw).length > 0) {
      throw createError({ statusCode: 400, message: 'Request body must be empty', data: { code: 'VALIDATION_ERROR' } });
    }
    return {};
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.issues.map(sanitizeValidationIssue);
    const first = issues[0];
    const firstReason = first
      ? `${formatIssuePath(first.path)}${first.path.length > 0 ? ': ' : ''}${first.message}`
      : 'Invalid request';
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid request',
      message: `Request validation failed: ${firstReason}`,
      data: { code: 'VALIDATION_ERROR', issues },
    });
  }
  assertSafeJson(result.data);
  return result.data as Record<string, unknown>;
}

interface PublicValidationIssue {
  code: string;
  message: string;
  path: Array<string | number>;
}

function sanitizeValidationIssue(issue: av.ValidationIssue): PublicValidationIssue {
  const expected = issue.expected ? ` ${issue.expected}` : '';
  const message = (() => {
    switch (issue.code) {
      case 'required': return 'This field is required';
      case 'unknown_key': return 'This field is not allowed';
      case 'invalid_type': return `Expected${expected || ' a different value type'}`;
      case 'too_small': return `Value is below the minimum${expected}`;
      case 'too_large': return `Value exceeds the maximum${expected}`;
      case 'invalid_string': return issue.message;
      case 'invalid_number': return `Invalid number${expected ? `; expected${expected}` : ''}`;
      case 'invalid_literal': return `Expected${expected || ' the required value'}`;
      case 'invalid_union': return 'Value does not match any allowed format';
      case 'too_deep': return 'Value is nested too deeply';
      default: return 'Invalid value';
    }
  })();
  return { code: issue.code, message, path: [...issue.path] };
}

function formatIssuePath(path: Array<string | number>): string {
  return path.reduce<string>((result, part) => typeof part === 'number'
    ? `${result}[${part}]`
    : result ? `${result}.${part}` : String(part), '');
}

export function validatedBody(event: H3Event): Record<string, unknown> {
  return event.context.vaultValidatedBody as Record<string, unknown> ?? {};
}

async function readBoundedBody(event: H3Event, limit: number): Promise<Record<string, unknown>> {
  const length = Number(event.node.req.headers['content-length'] ?? '0');
  if (Number.isFinite(length) && length > limit) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of event.node.req) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    size += chunk.length;
    if (size > limit) throw tooLarge();
    chunks.push(chunk);
  }
  const textBody = Buffer.concat(chunks).toString('utf8');
  if (!textBody) return {};
  try {
    const contentType = String(event.node.req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase();
    const parsed: unknown = contentType === 'application/x-www-form-urlencoded'
      ? Object.fromEntries(new URLSearchParams(textBody))
      : JSON.parse(textBody);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('object required');
    return parsed as Record<string, unknown>;
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body', message: 'Request body must be a valid object', data: { code: 'INVALID_BODY' } });
  }
}

function tooLarge() {
  return createError({ statusCode: 413, statusMessage: 'Request body too large', message: 'Request body is too large', data: { code: 'PAYLOAD_TOO_LARGE' } });
}

function assertSafeJson(input: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    if (++nodes > 20_000 || depth > 64) {
      throw createError({ statusCode: 400, message: 'Request body is too complex', data: { code: 'VALIDATION_ERROR' } });
    }
    if (Array.isArray(value)) {
      for (const item of value) stack.push({ value: item, depth: depth + 1 });
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
          throw createError({ statusCode: 400, message: 'Request body contains a forbidden key', data: { code: 'VALIDATION_ERROR' } });
        }
        stack.push({ value: item, depth: depth + 1 });
      }
    }
  }
}
