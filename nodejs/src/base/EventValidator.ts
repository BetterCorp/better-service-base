/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.  
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd  
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license, please contact the copyright holders at 
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

import { IPluginLogging, DTrace, BSBType } from "../interfaces/index.js";
import type { ParseResult } from 'anyvali';

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
}

export interface EventValidationConfig {
  enabled?: boolean;
  logValidationErrors?: boolean;
  throwOnValidationFailure?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  performanceThreshold?: number;
}

const DEFAULT_VALIDATION_CONFIG: EventValidationConfig = {
  enabled: true,
  logValidationErrors: true,
  throwOnValidationFailure: true,
  maxRetries: 0,
  retryDelay: 0,
  performanceThreshold: 100
};

/**
 * Utility class for validating event data using AnyVali schemas.
 * Provides performance monitoring and configurable validation behavior.
 * @group Validation
 * @category Tools
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/EventValidator.html | API: EventValidator}
 */
export class EventValidator {
  private config: EventValidationConfig;
  private logger?: IPluginLogging;

  /**
   * Create a new EventValidator instance.
   * @param config - Validation configuration options
   * @param logger - Optional logger for error reporting
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/EventValidator.html#constructor | API: EventValidator#constructor}
   */
  constructor(config: Partial<EventValidationConfig> = {}, logger?: IPluginLogging) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Update validation configuration at runtime.
   * @param config - New configuration options to merge
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/EventValidator.html#updateConfig | API: EventValidator#updateConfig}
   */
  public updateConfig(config: Partial<EventValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Validate input data for an event.
   * @param eventName - Name of the event being validated
   * @param data - Data to validate
   * @param schema - AnyVali schema to validate against
   * @param trace - Trace for logging context
   * @param eventConfig - Override configuration for this validation
   * @returns Validation result with parsed data or error
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/EventValidator.html#validateInput | API: EventValidator#validateInput}
   */
  public validateInput<T = unknown>(
    eventName: string,
    data: unknown,
    schema: BSBType,
    trace: DTrace,
    eventConfig?: Partial<EventValidationConfig>
  ): ValidationResult<T> {
    return this.performValidation(eventName, data, schema as BSBType, trace, 'input', eventConfig);
  }

  /**
   * Validate output/return data for an event.
   * @param eventName - Name of the event being validated
   * @param data - Data to validate
   * @param schema - AnyVali schema to validate against
   * @param trace - Trace for logging context
   * @param eventConfig - Override configuration for this validation
   * @returns Validation result with parsed data or error
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/EventValidator.html#validateOutput | API: EventValidator#validateOutput}
   */
  public validateOutput<T = unknown>(
    eventName: string,
    data: unknown,
    schema: BSBType,
    trace: DTrace,
    eventConfig?: Partial<EventValidationConfig>
  ): ValidationResult<T> {
    return this.performValidation(eventName, data, schema as BSBType, trace, 'output', eventConfig);
  }

  /**
   * Validate event data using schemas from a validation schema map.
   * @param eventName - Name of the event to validate
   * @param data - Data to validate
   * @param schemas - Map of event validation schemas
   * @param trace - Trace for logging context
   * @param direction - Whether validating 'input' or 'output' data
   * @returns Validation result or null if no schema is defined
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/EventValidator.html#validateFromSchemas | API: EventValidator#validateFromSchemas}
   */
  public validateFromSchemas<T = unknown>(
    eventName: string,
    data: unknown,
    schemas: any,
    trace: DTrace,
    direction: 'input' | 'output' = 'input'
  ): ValidationResult<T> | null {
    const eventSchema = schemas[eventName];
    if (!eventSchema) {
      return null; // No validation schema defined for this event
    }

    const schema = direction === 'input' ? eventSchema.input : eventSchema.output;
    if (!schema) {
      return null; // No schema defined for this direction
    }

    return this.performValidation(eventName, data, schema, trace, direction, eventSchema.config);
  }

  /**
   * Check if validation is enabled for the current configuration.
   * @param eventConfig - Override configuration to check
   * @returns True if validation is enabled
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/EventValidator.html#isValidationEnabled | API: EventValidator#isValidationEnabled}
   */
  public isValidationEnabled(eventConfig?: Partial<EventValidationConfig>): boolean {
    const config = { ...this.config, ...eventConfig };
    return config.enabled === true;
  }

  /**
   * Internal method to perform the actual validation with performance monitoring.
   */
  private performValidation<T = unknown>(
    eventName: string,
    data: unknown,
    schema: BSBType,
    trace: DTrace,
    direction: 'input' | 'output',
    eventConfig?: Partial<EventValidationConfig>
  ): ValidationResult<T> {
    const config = { ...this.config, ...eventConfig };

    if (!config.enabled) {
      return { success: true, data: data as T };
    }

    const startTime = performance.now();
    
    try {
      const parsedData = schema.parse(data) as T;
      const duration = performance.now() - startTime;
      
      // Log performance warning if threshold exceeded
      if (config.performanceThreshold && duration > config.performanceThreshold) {
        this.logger?.warn(trace, 
          `Event validation for '${eventName}' ${direction} took ${duration.toFixed(2)}ms (threshold: ${config.performanceThreshold}ms)`
        );
      }

      return {
        success: true,
        data: parsedData
      };
    } catch (error) {
      if (config.logValidationErrors && this.logger) {
        const errorMsg = `Event validation failed for '${eventName}' ${direction}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(trace, errorMsg);
      }

      if (config.throwOnValidationFailure) {
        throw error;
      }

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}

/**
 * Custom error class for validation failures.
 * @group Validation
 * @category Errors
 * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ValidationError.html | API: ValidationError}
 */
export class ValidationError extends Error {
  /**
   * Create a new validation error.
   * @param message - Error message
   * @param issues - The underlying AnyVali validation issues
   * @param eventName - Name of the event that failed validation
   * @param direction - Whether the failure was on 'input' or 'output'
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ValidationError.html#constructor | API: ValidationError#constructor}
   */
  constructor(
    message: string,
    public readonly issues: ParseResult<unknown> extends { success: false; issues: infer TIssues } ? TIssues : unknown,
    public readonly eventName: string,
    public readonly direction: 'input' | 'output'
  ) {
    super(message);
    this.name = 'ValidationError';
    
    // Maintain proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }

  /**
   * Get a formatted string representation of the validation errors.
   * @returns Formatted error details
   * @see {@link https://bsbcode.dev/languages/nodejs/types/classes/ValidationError.html#getFormattedErrors | API: ValidationError#getFormattedErrors}
   */
  public getFormattedErrors(): string {
    return (this.issues as any[]).map((err: any) =>
      `${err.path.join('.')}: ${err.message}`
    ).join('; ');
  }
}
