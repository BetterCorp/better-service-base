import { ServicesBase } from "../../service/service";
import { ServiceCallable } from "../../service/base";
import { testClient } from "../service-default/plugin";

export interface testCallable extends ServiceCallable {
  abc(a: boolean): Promise<void>;
}

export interface testEvents extends ServiceCallable {
  abcd(a: boolean): Promise<void>;
}

export interface testRetEvents extends ServiceCallable {
  abcdx(a: boolean): Promise<boolean>;
}

export class Service
  extends ServicesBase<testEvents, testRetEvents, testCallable, any>
  implements testCallable
{
  async abc(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async run() {
    //console.log('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1')
    let ppp = new testClient(this);
    //console.log('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2')
    await ppp.register();
    //console.log('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3')
    ppp.abc(false);
  }
}
