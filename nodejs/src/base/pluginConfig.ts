import { z } from "zod";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./index";

/**
 * The definition of the config with zod validation
 * @example
 * const configDefinition = z.object({
 *  a: z.string(),
 * });
 */
export type BSBPluginConfigType = z.ZodTypeAny | undefined;
export type BSBPluginConfigDefinition = BSBPluginConfig<z.ZodTypeAny>;

/**
 * Config migration handler, allows for config migrations when the plugin version changes or a new plugin setup is done
 * @example simple version change and basic setup
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: z.infer<BSBConfigDefinition>) => {
 * if (versionFrom === null) {
 *  return {
 *   a: "a",
 *  };
 * }
 * return {
 *  a: "b",
 * };
 * @example basic setup and no version change handling
 * const configMigration = async (versionFrom: string | null, versionTo: string, existingConfig?: z.infer<BSBConfigDefinition>) => {
 * if (versionFrom === null || existingConfig === undefined) {
 *  return {
 *   a: "a",
 *  };
 * }
 * return existingConfig;
 */
export type BSBConfigMigration<T extends BSBPluginConfigType> = (
  versionFrom: string | null,
  versionTo: string,
  existingConfig?: z.infer<Exclude<T, undefined>>
) => Promise<z.infer<Exclude<T, undefined>>>;

export type BSBConfigDefintionReference<
  T extends BSBPluginConfigType,
  AS = undefined
> = T extends undefined ? AS : z.infer<Exclude<T, undefined>>;

export type BSBReferenceConfigType = BSBPluginConfigType | null;
export type BSBReferencePluginConfigType = BSBPluginConfigDefinition | null;
export type BSBReferenceConfigDefinition<
  ReferencedConfig extends BSBReferenceConfigType
> = ReferencedConfig extends null ? null : ReferencedConfig;
export type BSBReferencePluginConfigDefinition<
  ReferencedConfig extends BSBReferencePluginConfigType
> = ReferencedConfig extends null
  ? null
  : ReferencedConfig extends BSBPluginConfigDefinition
  ? z.infer<ReferencedConfig["validationSchema"]>
  : null;

export abstract class BSBPluginConfig<
  MyPluginConfig extends Exclude<BSBPluginConfigType, undefined> | null = null
> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(cwd: string, pluginCwd: string, pluginName: string) {}
  public abstract validationSchema: MyPluginConfig;
  /**
   * Migrate the config from one version to another
   *
   * @todo Future feature - not implemented yet
   * @todo write your migration code if you do make changes you'd like to have migratable
   */
  public abstract migrate?(
    toVersion: string,
    fromVersion: string | null,
    fromConfig: any | null
  ): MyPluginConfig extends BSBPluginConfigType
    ? z.infer<MyPluginConfig>
    : null;
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBPluginConfigRef extends BSBPluginConfig<any> {
  public validationSchema = {};
  public migrate?(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    toVersion: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fromVersion: string | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fromConfig: any
  ) {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBPluginConfigRef", "migrate");
  }
}
