import assert from 'node:assert/strict';
import test from 'node:test';
import { Plugin } from '../src/plugins/observable-logging-file/index.js';

test('file logger stops writing while backpressured and reports dropped records', () => {
  const plugin = Object.create(Plugin.prototype) as any;
  let writes = 0;
  Object.defineProperty(plugin, 'config', { value: { format: { prettyPrint: false, timestamp: false, traceInfo: false } } });
  plugin.logFormatter = { formatLog: (_trace: any, message: string) => message };
  plugin.logStream = { write: () => { writes++; return false; }, end: () => {} };
  plugin.droppedLogs = 0;
  plugin.writeLog('info', {}, 'test', 'first');
  for (let i = 0; i < 100; i++) plugin.writeLog('info', {}, 'test', 'blocked');
  assert.equal(writes, 1);
  assert.equal(plugin.droppedLogs, 100);
  const previous = console.error;
  const reports: string[] = [];
  try {
    console.error = (message: string) => reports.push(message);
    plugin.dispose();
  } finally { console.error = previous; }
  assert.match(reports[0], /Dropped 100 log records/);
});
