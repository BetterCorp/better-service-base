import { BSBService, BSBServiceConstructor } from "../../";
import { testClient } from "../service-default1";

export class Plugin extends BSBService<null> {
  public initBeforePlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;
  public methods = {};
  dispose?(): void;
  init?(): void | Promise<void>;
  public override initAfterPlugins: string[] = ["service-default1"];
  private testClient: testClient;
  constructor(config: BSBServiceConstructor) {
    super(config);
    this.testClient = new testClient(this);
  }
  public override async run() {
    await this.testClient.abc(10, 12, 11, 13);
  }
}
