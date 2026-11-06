import * as assert from "node:assert";
import { describe, it } from "node:test";
import { isLoopback } from "../plugins/service-syslog-server/index.js";

describe("syslog listener security", () => {
  it("recognizes only loopback bind addresses without explicit public opt-in", () => {
    for (const address of ["localhost", "127.0.0.1", "127.25.1.9", "::1", "[::1]"])
      assert.equal(isLoopback(address), true);
    for (const address of ["0.0.0.0", "::", "192.168.1.10", "example.com"])
      assert.equal(isLoopback(address), false);
  });
});
