type PluginConfigSchema = {
  export?: (mode?: "portable" | "extended") => { root: { kind: string } };
  parse: (input: unknown, options?: { unknownKeys?: "strip" }) => unknown;
};

export function parsePluginConfig(
  serviceConfig: { validationSchema?: PluginConfigSchema } | null | undefined,
  rawConfig: unknown,
): object | null | undefined {
  const schema = serviceConfig?.validationSchema;
  if (schema === undefined) {
    return undefined;
  }

  const rootKind = typeof schema.export === "function"
    ? schema.export("extended").root.kind
    : undefined;
  return schema.parse(
    rawConfig ?? (rootKind === "object" ? {} : undefined),
    { unknownKeys: "strip" },
  ) as object | null;
}
