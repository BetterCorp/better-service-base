/** Implementation language identifiers shared by manifests, registry and Vault. */
export const PLUGIN_LANGUAGES = ['nodejs', 'csharp', 'go', 'java', 'python', 'rust'] as const;
export type PluginLanguage = typeof PLUGIN_LANGUAGES[number];

export function normalizePluginLanguage(value: unknown): PluginLanguage {
  const language = value === 'dotnet' ? 'csharp' : value;
  if (!PLUGIN_LANGUAGES.includes(language as PluginLanguage)) {
    throw new Error(`Unsupported plugin language: ${String(value)}`);
  }
  return language as PluginLanguage;
}
