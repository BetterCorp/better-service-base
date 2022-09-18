"use strict";
Object.defineProperty(exports, "__esModule", {
  value: true
});
const logger_1 = require("../lib/interfaces/logger");
class Logger extends logger_1.CLogger {
  events = {};
  constructor(pluginName, cwd, log, appConfig, events) {
    super(pluginName, cwd, log, appConfig);
    this.events = events;
  }
  async thisLog(key, plugin, ...data) {
    if (this.events[key] !== undefined)
      this.events[key](...data);
    else
      await this.log[key](plugin, ...data);
  }
  async debug(plugin, ...data) {
    await this.thisLog('debug', plugin, `[DEBUG][${plugin.toUpperCase()}]`, data);
  }
  async info(plugin, ...data) {
    await this.thisLog('debug', plugin, `[${plugin.toUpperCase()}]`, data);
  }
  async warn(plugin, ...data) {
    await this.thisLog('warn', plugin, `[${plugin.toUpperCase()}]`, data);
  }
  async error(plugin, ...data) {
    await this.thisLog('error', plugin, `[${plugin.toUpperCase()}]`, data);
  }
  async fatal(plugin, ...data) {
    await this.thisLog('fatal', plugin, 'FATAL', ...data);
  }
}
exports.testogger = Logger;