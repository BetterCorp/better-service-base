import { z } from "zod";

export abstract class SecConfig<
  MyPluginConfig extends any,
  MyValidationSchema = z.ZodSchema<MyPluginConfig>
> {
  abstract validationSchema: MyValidationSchema;
  abstract init(
    cwd: string,
    plugin: any,
    existingConfig?: MyPluginConfig
  ): MyPluginConfig;
}
