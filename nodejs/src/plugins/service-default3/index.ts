import {z} from "zod";
import {
  BSBPluginConfig,
  BSBPluginEvents,
  BSBService,
  BSBServiceConstructor, ServiceClient,
  ServiceEventsBase,
} from "../../index";
import {Plugin as Default0Plugin} from "../../plugins/service-default0/index";

export const secSchema = z.object({});

export class Config
    extends BSBPluginConfig<typeof secSchema> {
  validationSchema = secSchema;

  migrate(
      toVersion: string,
      fromVersion: string | null,
      fromConfig: any | null,
  ) {
    return fromConfig;
  }
}

export interface ServiceTypes
    extends BSBPluginEvents {
  onEvents: ServiceEventsBase;
  emitEvents: ServiceEventsBase;
  onReturnableEvents: {
    onReverseReturnable: (tex: string) => Promise<string>;
  };
  emitReturnableEvents: ServiceEventsBase;
  onBroadcast: ServiceEventsBase;
  emitBroadcast: ServiceEventsBase;
}

export class Plugin
    extends BSBService<Config, ServiceTypes> {
  public static PLUGIN_CLIENT = {name: "service-default3"};
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {
    testMethod: () => {
      this.log.info("TEST CALLABLE OK");
      return "test";
    },
  };

  dispose?(): void;

  public initAfterPlugins: string[] = ["service-default2"];
  private testClient: ServiceClient<Default0Plugin>;

  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new ServiceClient<Default0Plugin>(Default0Plugin, this);
  }

  public async init() {
    await this.events.onReturnableEvent(
        "onReverseReturnable",
        async (traceId: string, tex: string) => {
          this.log.warn("onReverseReturnable ({tex})", {tex});
          return tex.split("")
                    .reverse()
                    .join("");
        },
    );
  }

  public async run() {
    const traceId = this.metrics.createTrace().id;
    await this.testClient.callMethod("abc", traceId, 18, 19, 20, 21);
    this.log.error("Error {a}", {a: "b"});
  }
}
