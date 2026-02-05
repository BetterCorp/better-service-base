"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plugin = exports.Config = exports.GraylogConfigSchema = void 0;
const service_base_1 = require("@bettercorp/service-base");
const zod_1 = require("zod");
const gelfPro = __importStar(require("gelf-pro"));
/**
 * Configuration schema for Graylog observable
 */
exports.GraylogConfigSchema = zod_1.z.object({
    host: zod_1.z.string().default("localhost"),
    port: zod_1.z.number().int().min(1).max(65535).default(12201),
    protocol: zod_1.z.enum(["udp", "tcp", "http"]).default("udp"),
    // HTTP-specific settings
    httpEndpoint: zod_1.z.string().url().optional(),
    // GELF settings
    facility: zod_1.z.string().default("bsb"),
    // Additional fields to include in all messages
    additionalFields: zod_1.z.record(zod_1.z.string(), zod_1.z.union([
        zod_1.z.string(),
        zod_1.z.number(),
        zod_1.z.boolean(),
    ])).default({}),
    // Compression (for UDP/TCP)
    compress: zod_1.z.boolean().default(true),
    // Log level filtering
    levels: zod_1.z.object({
        debug: zod_1.z.boolean().default(true),
        info: zod_1.z.boolean().default(true),
        warn: zod_1.z.boolean().default(true),
        error: zod_1.z.boolean().default(true),
    }),
});
/**
 * Configuration class
 */
class Config extends service_base_1.BSBPluginConfig {
    validationSchema = exports.GraylogConfigSchema;
}
exports.Config = Config;
/**
 * Convert BSB log level to GELF/syslog severity level
 */
function bsbLevelToGelfLevel(level) {
    const normalized = level.toLowerCase();
    switch (normalized) {
        case "error":
            return 3; // Error
        case "warn":
        case "warning":
            return 4; // Warning
        case "info":
            return 6; // Informational
        case "debug":
            return 7; // Debug
        default:
            return 6; // Informational
    }
}
/**
 * Graylog (GELF) observable plugin - sends logs to Graylog servers
 */
class Plugin extends service_base_1.BSBObservable {
    logFormatter = new service_base_1.LogFormatter();
    isDisposed = false;
    constructor(config) {
        super(config);
    }
    async init() {
        // Configure gelf-pro adapter
        const adapterName = this.config.protocol === "tcp" ? "tcp" : "udp";
        const adapterOptions = {
            host: this.config.host,
            port: this.config.port,
        };
        // Set default fields including facility
        const fields = {
            facility: this.config.facility,
            ...this.config.additionalFields,
        };
        // Initialize gelf-pro
        gelfPro.setConfig({
            adapterName,
            adapterOptions,
            fields,
        });
    }
    async run() {
        // No runtime setup needed
    }
    /**
     * Send log to Graylog
     */
    sendLog(level, trace, pluginName, message, meta) {
        if (this.isDisposed) {
            return;
        }
        try {
            const formattedMessage = this.logFormatter.formatLog(trace, message, meta);
            const gelfLevel = bsbLevelToGelfLevel(level);
            // Build GELF extra fields (GELF uses underscore prefix for custom fields)
            const extraFields = {
                _plugin: pluginName,
                _trace_id: trace.t,
                _span_id: trace.s,
                _level: level,
            };
            // Add metadata fields with underscore prefix (GELF convention)
            if (meta) {
                for (const [key, value] of Object.entries(meta)) {
                    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                        extraFields[`_${key}`] = value;
                    }
                    else {
                        extraFields[`_${key}`] = JSON.stringify(value);
                    }
                }
            }
            // Send to Graylog using the message method
            gelfPro.message(formattedMessage, gelfLevel, extraFields, (err) => {
                if (err) {
                    console.error(`[observable-graylog] Failed to send log: ${err.message}`);
                }
            });
        }
        catch (err) {
            console.error(`[observable-graylog] Send error: ${err.message}`);
        }
    }
    // Logging methods
    debug(trace, pluginName, message, meta) {
        if (this.mode === "production" || !this.config.levels.debug) {
            return;
        }
        this.sendLog("debug", trace, pluginName, message, meta);
    }
    info(trace, pluginName, message, meta) {
        if (!this.config.levels.info) {
            return;
        }
        this.sendLog("info", trace, pluginName, message, meta);
    }
    warn(trace, pluginName, message, meta) {
        if (!this.config.levels.warn) {
            return;
        }
        this.sendLog("warn", trace, pluginName, message, meta);
    }
    error(trace, pluginName, message, meta) {
        if (!this.config.levels.error) {
            return;
        }
        if (message instanceof service_base_1.BSBError) {
            if (message.raw !== null) {
                this.sendLog("error", message.raw.trace, pluginName, message.raw.message, message.raw.meta);
            }
            else {
                this.sendLog("error", trace, pluginName, message.message);
            }
        }
        else {
            this.sendLog("error", trace, pluginName, message, meta);
        }
    }
    dispose() {
        this.isDisposed = true;
        // gelf-pro doesn't require explicit cleanup
    }
}
exports.Plugin = Plugin;
