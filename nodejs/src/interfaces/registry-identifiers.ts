export const REGISTRY_IDENTIFIER_PATTERN = '^(?:_|@?[a-zA-Z0-9_][a-zA-Z0-9._-]*)$';
export const REGISTRY_PLUGIN_ID_PATTERN = '^(?:_|@?[a-zA-Z0-9_][a-zA-Z0-9._-]*)(?:/(?:_|@?[a-zA-Z0-9_][a-zA-Z0-9._-]*))?$';

export function parseRegistryPluginId(pluginId: string): { org: string; name: string } {
  if (pluginId.length > 200 || pluginId.trim() !== pluginId || !new RegExp(REGISTRY_PLUGIN_ID_PATTERN).test(pluginId)) {
    throw new Error('Plugin ID must be a valid name or org/name');
  }
  const parts = pluginId.split('/');
  return parts.length === 1 ? { org: '_', name: parts[0]! } : { org: parts[0]!, name: parts[1]! };
}
