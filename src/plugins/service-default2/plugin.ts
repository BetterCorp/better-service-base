import { ServicesBase } from "../../service/service";
import { testClient } from "../service-default1/plugin";

export class Service extends ServicesBase {
  public override initAfterPlugins: string[] = ["service-default1"];
  async run() {
    let ppp = new testClient(this);
    await ppp.register();
    ppp.abc();
  }
}
