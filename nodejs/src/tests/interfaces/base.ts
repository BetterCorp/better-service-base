import assert from "assert";
import { DefaultBase } from "../../../src/interfaces/base";
import { ErrorMessages } from "../../../src/interfaces/static";

describe("DefaultBase", function () {
  describe("Default methods", function () {
    it("getPluginConfig should throw", async () => {
      try {
        let myobj = new DefaultBase("a", "b", "c", {} as any);
        (myobj as any).getPluginConfig();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.BSBNotInit);
      }
    });
    it("getPluginState should throw", async () => {
      try {
        let myobj = new DefaultBase("a", "b", "c", {} as any);
        await (myobj as any).getPluginState();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.deepEqual(e, ErrorMessages.BSBNotInit);
      }
    });
  });
});
