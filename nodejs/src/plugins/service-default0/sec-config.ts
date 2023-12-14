import { BSBServiceConfig } from "../../interfaces";
import { z } from "zod";

export const secSchema = z.object({
  testa: z.number(),
  testb: z.number(),
});
export class Config extends BSBServiceConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
    toVersion: string,
    fromVersion: string | null,
    fromConfig: any | null
  ) {
    if (fromConfig === null) {
      // defaults
      return {
        testa: 1,
        testb: 2,
      };
    } else {
      // migrate
      return {
        testa: fromConfig.testa,
        testb: fromConfig.testb,
      };
    }
  }
}
