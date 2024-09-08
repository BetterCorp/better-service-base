import {BSBPluginConfig, BSBService, BSBServiceConstructor, ServiceClient} from "../../base";
import {Plugin as Default1Plugin} from "../../plugins/service-default1/index";
import {z} from "zod";
import {BSBServiceClientDefinition} from "../../base";

export const secSchema = z.object({
  testa: z.number(),
  testb: z.number(),
});

export class Config
    extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
      toVersion: string,
      fromVersion: string | null,
      fromConfig: any | null,
  ) {
    if (fromConfig === null) {
      // defaults
      return {
        testa: 1,
        testb: 2,
      };
    }
    else {
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

export class Plugin
    extends BSBService<Config, Events> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: "service-default0",
  }
  public initBeforePlugins?: string[] | undefined;
  //public initAfterPlugins: string[] = ["service-default3"];
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  public init?(): Promise<void>;

  public dispose?(): void;

  public readonly methods = {
    abc: async (traceId: string, ...numbers: Array<number>) => {
      this.log.info("abc called: {numbers}", {numbers});
    },
  };
  private testClient: ServiceClient<Default1Plugin>;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new ServiceClient(Default1Plugin, this);
  }

  public async run() {
    const traceId = this.metrics.createTrace().id;
    this.log.info("aa");
    this.events.emitEvent("test", traceId, "test", "test");
    await this.testClient.callMethod('callableMethod',
        traceId,
        this.config.testa,
        this.config.testb,
    );

    setTimeout(() => {
      const trace = this.metrics.createTrace();
      const span = trace.createSpan("test-span");
      console.log("abc called");
      span.end();
      trace.end();
      console.log(trace);
    }, 5000);
  }
}
