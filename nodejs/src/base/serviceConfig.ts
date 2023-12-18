import {  z } from "zod";
import { BSB_ERROR_METHOD_NOT_IMPLEMENTED } from "./errorMessages";
import { BSBConfigType } from './base';

export abstract class BSBServiceConfig<MyPluginConfig extends Exclude<BSBConfigType, undefined>> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(cwd: string, pluginCwd: string, pluginName: string) {}
  abstract validationSchema: MyPluginConfig;
  abstract migrate(
    toVersion: string,
    fromVersion: string | null,
    fromConfig: any | null
  ): z.infer<MyPluginConfig>;
}

/**
 * DO NOT REFERENCE/USE THIS CLASS - IT IS AN INTERNALLY REFERENCED CLASS
 */
export class BSBServiceConfigRef extends BSBServiceConfig<any> {
  validationSchema = {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  migrate(toVersion: string, fromVersion: string | null, fromConfig: any) {
    throw BSB_ERROR_METHOD_NOT_IMPLEMENTED("BSBServiceConfigRef", "migrate");
  }
}
