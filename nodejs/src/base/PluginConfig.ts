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

import {z} from "zod";
import {BSB_ERROR_METHOD_NOT_IMPLEMENTED} from "./errorMessages";

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
    existingConfig?: z.infer<Exclude<T, undefined>>,
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
  constructor(cwd: string, packageCwd: string, pluginCwd: string, pluginName: string) {
  }

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
      fromConfig: any | null,
  ): MyPluginConfig extends BSBPluginConfigType
     ? z.infer<MyPluginConfig>
     : null;
}

/**
 * @hidden
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBPluginConfigRef
    extends BSBPluginConfig<any> {
  public validationSchema = {};

  public migrate?(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toVersion: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      fromVersion: string | null,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      fromConfig: any,
  ) {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBPluginConfigRef", "migrate");
  }
}
