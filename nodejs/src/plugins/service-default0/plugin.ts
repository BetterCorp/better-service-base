import { BSBService, BSBServiceConstructor, BSBPluginConfig } from "../../";
import { testClient } from "../service-default1";
import { z } from "zod";

export const secSchema = z.object({
  testa: z.number(),
  testb: z.number(),
});
export class Config extends BSBPluginConfig<typeof secSchema> {
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

export interface Events {
  emitEvents: {
    test: (a: string, b: string) => Promise<void>;
  };
  onEvents: {};
  emitReturnableEvents: {};
  onReturnableEvents: {};
  emitBroadcast: {};
  onBroadcast: {};
}

export class Plugin extends BSBService<Config, Events> {
  public initBeforePlugins?: string[] | undefined;
  //public initAfterPlugins: string[] = ["service-default3"];
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public init?(): Promise<void>;
  public dispose?(): void;
  public readonly methods = {
    abc: async () => {
      console.log("abc called");
    },
  };
  private testClient: testClient;
  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new testClient(this);
  }
  public async run() {
    this.log.info("aa");
    this.events.emitEvent("test", "test", "test");
    await this.testClient.abc(
      this.config.testa,
      this.config.testb,
      this.config.testa,
      this.config.testb
    );
  }
}
