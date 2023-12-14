import {
  BSBService,
  BSBServiceConstructor,
  BSBServiceTypes,
} from "../../base/service";
import { testClient } from "../service-default1/plugin";
import { Config } from "./sec-config";

export interface ServiceTypes extends BSBServiceTypes {
  methods: {
    abc: () => Promise<void>;
  };
  emitEvents: {
    test: (a: string, b: string) => Promise<void>;
  };
  onEvents: {};
  emitReturnableEvents: {};
  onReturnableEvents: {};
  emitBroadcast: {};
  onBroadcast: {};
}
export class Plugin extends BSBService<Config, ServiceTypes> {
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
