import { DynamicModule, Global, Module } from '@nestjs/common'
import type { FastifyInstance } from 'fastify'
import { APP_OPTIONS, AppOptions } from './app-options.js'
import { FASTIFY_INSTANCE } from './fastify.provider.js'

/**
 * Global module that exposes the caller-provided runtime values (the Fastify
 * instance and the plugin options) through dependency injection. It is declared
 * `@Global()` so any feature module can inject the APP_OPTIONS and
 * FASTIFY_INSTANCE tokens without importing this module explicitly.
 */
@Global()
@Module({})
export class RuntimeModule {
  static forRoot (fastify: FastifyInstance, opts: AppOptions): DynamicModule {
    return {
      module: RuntimeModule,
      providers: [
        { provide: APP_OPTIONS, useValue: opts },
        { provide: FASTIFY_INSTANCE, useValue: fastify }
      ],
      exports: [APP_OPTIONS, FASTIFY_INSTANCE]
    }
  }
}
