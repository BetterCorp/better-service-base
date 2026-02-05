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
import { BSBObservable, BSBObservableConstructor, BSBPluginConfig, BSBError } from "@bsb/base";
import { DTrace, LogMeta } from "@bsb/base";
import { z } from "zod";
/**
 * Configuration schema for Graylog observable
 */
export declare const GraylogConfigSchema: z.ZodObject<{
    host: z.ZodDefault<z.ZodString>;
    port: z.ZodDefault<z.ZodNumber>;
    protocol: z.ZodDefault<z.ZodEnum<{
        udp: "udp";
        tcp: "tcp";
        http: "http";
    }>>;
    httpEndpoint: z.ZodOptional<z.ZodString>;
    facility: z.ZodDefault<z.ZodString>;
    additionalFields: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
    compress: z.ZodDefault<z.ZodBoolean>;
    levels: z.ZodObject<{
        debug: z.ZodDefault<z.ZodBoolean>;
        info: z.ZodDefault<z.ZodBoolean>;
        warn: z.ZodDefault<z.ZodBoolean>;
        error: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type GraylogConfig = z.infer<typeof GraylogConfigSchema>;
/**
 * Configuration class
 */
export declare class Config extends BSBPluginConfig<typeof GraylogConfigSchema> {
    validationSchema: z.ZodObject<{
        host: z.ZodDefault<z.ZodString>;
        port: z.ZodDefault<z.ZodNumber>;
        protocol: z.ZodDefault<z.ZodEnum<{
            udp: "udp";
            tcp: "tcp";
            http: "http";
        }>>;
        httpEndpoint: z.ZodOptional<z.ZodString>;
        facility: z.ZodDefault<z.ZodString>;
        additionalFields: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
        compress: z.ZodDefault<z.ZodBoolean>;
        levels: z.ZodObject<{
            debug: z.ZodDefault<z.ZodBoolean>;
            info: z.ZodDefault<z.ZodBoolean>;
            warn: z.ZodDefault<z.ZodBoolean>;
            error: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>;
}
/**
 * Graylog (GELF) observable plugin - sends logs to Graylog servers
 */
export declare class Plugin extends BSBObservable<Config> {
    private logFormatter;
    private isDisposed;
    constructor(config: BSBObservableConstructor<Config>);
    init(): Promise<void>;
    run(): Promise<void>;
    /**
     * Send log to Graylog
     */
    private sendLog;
    debug(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void;
    info(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void;
    warn(trace: DTrace, pluginName: string, message: string, meta: LogMeta<any>): void;
    error(trace: DTrace, pluginName: string, message: string | BSBError<any>, meta?: LogMeta<any>): void;
    dispose(): void;
}
