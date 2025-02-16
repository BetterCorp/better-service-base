/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program. 
 * The commercial license allows you to use the Program in a closed-source manner, 
 * including the right to create derivative works that are not subject to the terms 
 * of the AGPL. 
 *
 * To obtain a commercial license, please contact the copyright holders at 
 * https://www.bettercorp.dev. The terms and conditions of the commercial license 
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { assert } from "chai";
import { LogFormatter } from "../../index";
import { createFakeDTrace } from "../trace"
import { randomUUID } from "crypto";

describe("logFormatter", function () {
  describe("formatLog", function () {
    const dummyTrace = createFakeDTrace('INTERNAL', 'INTERNAL'); // This returns { t: "INTERNAL", s: "INTERNAL" }

    it("Should include trace prefix for INTERNAL trace", async () => {
      const ojb = new LogFormatter();
      assert.match(ojb.formatLog(dummyTrace, "TEST"), /^\[INTERNAL:INTERNAL\] TEST$/);
    });

    it("Should format trace IDs correctly with GUIDs", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const customTrace = createFakeDTrace(traceId, spanId);
      assert.match(ojb.formatLog(customTrace, "TEST"), new RegExp(`^\\[${ traceId }:${ spanId }\\] TEST$`));
    });

    it("Should note error when trace ID is empty", async () => {
      const ojb = new LogFormatter();
      const emptyTrace = createFakeDTrace("", "");
      assert.match(ojb.formatLog(emptyTrace, "TEST"), new RegExp(`TRACE ID ERROR`));
    });

    it("Should note error when span ID is empty", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const traceNoSpan = createFakeDTrace(traceId, "");
      assert.match(ojb.formatLog(traceNoSpan, "TEST"), new RegExp(`SPAN ID ERROR`));
    });

    it("Should handle message with no placeholders", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      assert.match(ojb.formatLog(trace, "Simple message"), new RegExp(`^\\[${ traceId }:${ spanId }\\] Simple message$`));
    });

    it("Should format correctly with meta", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      assert.match(
        ojb.formatLog(trace, "HTEST {a}", { a: "B" }),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST B$`)
      );
    });

    it("Should format *null/undefined* when value is missing", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      assert.match(
        ojb.formatLog(trace, "HTEST {a}", {} as any),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST \\*null\\/undefined\\*$`)
      );
    });

    it("Should format *null/undefined* when value is undefined", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      assert.match(
        ojb.formatLog(trace, "HTEST {a}", { a: undefined } as any),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST \\*null\\/undefined\\*$`)
      );
    });

    it("Should format date in ISO format", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.match(
        ojb.formatLog(trace, "HTEST {f}", { f: dt }),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST 2023-07-22T15:38:30\\.000Z$`)
      );
    });

    it("Should format multiple dates in ISO format", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.match(
        ojb.formatLog(trace, "HTEST {f}@{e}", { e: "DD", f: dt }),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST 2023-07-22T15:38:30\\.000Z@DD$`)
      );
    });

    it("Should handle nested object with date", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      const dt = new Date(1689694710000); // 18 Jul 2023 15:38:30 GMT
      assert.match(
        ojb.formatLog(trace, "HTEST {f.y}@{e}", { e: "DD", f: { y: dt } } as any),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST \\*null\\/undefined\\*@DD$`)
      );
    });

    it("Should format object as JSON", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      const dt = new Date(1690040310000); // Sat, 22 Jul 2023 15:38:30 GMT
      assert.match(
        ojb.formatLog(trace, "HTEST {f}@{e}", { e: "DD", f: { y: dt } }),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST {"y":"2023-07-22T15:38:30\\.000Z"}@DD$`)
      );
    });

    it("Should format array values", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      const dt = new Date(1690040310000);
      assert.match(
        ojb.formatLog(trace, "HTEST {f}@{e}:{a}", {
          a: ["E", "F"],
          e: "DD",
          f: { y: dt },
        } as any),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] HTEST {"y":"2023-07-22T15:38:30\\.000Z"}@DD:E,F$`)
      );
    });

    it("Should handle multiple placeholders with mixed types", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      assert.match(
        ojb.formatLog(trace, "Test {str} {num} {bool}", {
          str: "hello",
          num: 123,
          bool: true
        }),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] Test hello 123 true$`)
      );
    });

    it("Should handle special characters in values", async () => {
      const ojb = new LogFormatter();
      const traceId = randomUUID();
      const spanId = randomUUID();
      const trace = createFakeDTrace(traceId, spanId);
      assert.match(
        ojb.formatLog(trace, "Test {special}", {
          special: "!@#$%^&*()"
        }),
        new RegExp(`^\\[${ traceId }:${ spanId }\\] Test !@#\\$%\\^&\\*\\(\\)$`)
      );
    });
  });
});
