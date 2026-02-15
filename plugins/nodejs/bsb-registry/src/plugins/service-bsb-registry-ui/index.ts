/**
 * BSB Registry UI Plugin (Event-Driven)
 *
 * Web interface for browsing and searching BSB plugins.
 * Server-side rendered with Handlebars templates.
 * Uses events to communicate with registry core (local or distributed).
 */

import { Observable, BSBService, BSBServiceConstructor, createConfigSchema } from '@bsb/base';
import { createEventSchemas } from '@bsb/base';
import { z } from 'zod';
import { RegistryUIServer } from './http-server';
import { BsbRegistryClient } from '../../.bsb/clients/service-bsb-registry';

/**
 * Configuration for the Registry UI
 */
const UIConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(3200),
  host: z.string().default('0.0.0.0'),
  pageSize: z.number().min(1).max(100).default(20),
});

export type UIConfig = z.infer<typeof UIConfigSchema>;

export const Config = createConfigSchema(
  {
    name: 'BSB Registry UI & API',
    description: 'Event-driven web interface and REST API for browsing BSB plugins (content negotiation: HTML or JSON)',
    tags: ['registry', 'ui', 'api', 'web', 'rest', 'handlebars', 'server-side-rendering', 'content-negotiation'],
  },
  UIConfigSchema
);

/**
 * No events emitted - this plugin only consumes registry events
 */
export const EventSchemas = createEventSchemas({});

/**
 * Registry UI Plugin
 * Serves server-side rendered HTML with Handlebars templates
 * Communicates with registry core via events (not HTTP)
 */
export class Plugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  static Config = Config;
  static EventSchemas = EventSchemas;

  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  public registryClient;
  private server: RegistryUIServer;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas,
    });

    this.registryClient = new BsbRegistryClient(this);

    // Create HTTP server with events interface
    this.server = new RegistryUIServer(
      this.config.port,
      this.config.host,
      this.config.pageSize
    );
  }

  dispose(): void {
    this.server.close();
  }

  async init(obs: Observable): Promise<void> {
    const span = obs.startSpan('RegistryUI.init');

    try {
      obs.log.info('Initializing Registry UI on port {port}', { port: this.config.port });

      // Initialize server with plugin instance
      const initSpan = obs.startSpan('server.init');
      await this.server.init(obs, this);
      initSpan.end();

      obs.log.info('Registry UI initialized successfully');
    } catch (error) {
      obs.log.error('Failed to initialize Registry UI: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  async run(obs: Observable): Promise<void> {
    const span = obs.startSpan('RegistryUI.run');

    try {
      obs.log.info('Starting Registry UI server');

      const startSpan = obs.startSpan('server.start');
      await this.server.start(obs);
      startSpan.end();

      obs.log.info(
        'Registry UI started at http://{host}:{port}',
        { host: this.server.host, port: this.server.port }
      );
    } catch (error) {
      obs.log.error('Failed to start Registry UI: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }
}
