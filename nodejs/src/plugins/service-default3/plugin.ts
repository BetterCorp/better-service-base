import { BSBService, BSBServiceConstructor } from "../../base/service";
import { testClient } from "../service-default1/plugin";

export class Plugin extends BSBService<any> {
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {};
  dispose?(): void;
  init?(): void | Promise<void>;
  public override initAfterPlugins: string[] = ["service-default2"];
  private testClient: testClient;
  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new testClient(this);
  }
  public override async run() {
    await this.testClient.abc(18, 19, 20, 21);
  }
}
