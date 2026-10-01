/** Resolve a logical service name to exactly one configured profile alias. */
export function resolveServiceReference(
  services: Record<string, { plugin: string; enabled?: boolean }>,
  target: string,
): { name: string; enabled: boolean } | null {
  // An explicit alias selects that entry even when several entries use the same plugin.
  if (Object.hasOwn(services, target) && services[target].plugin !== target) {
    return { name: target, enabled: services[target].enabled === true };
  }

  const matches = Object.entries(services).filter(([, definition]) => definition.plugin === target);
  const active = matches.filter(([, definition]) => definition.enabled === true);
  if (active.length > 1 || (active.length === 0 && matches.length > 1)) {
    throw new Error(`Ambiguous service reference ${target}; use its profile alias`);
  }

  const selected = active[0] ?? matches[0];
  return selected ? { name: selected[0], enabled: selected[1].enabled === true } : null;
}
