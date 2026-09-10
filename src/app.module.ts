import { DynamicModule, Module } from '@nestjs/common'
import type { FastifyInstance } from 'fastify'
import { AppOptions } from './app-options.js'
import { RuntimeModule } from './runtime.module.js'
import { ConfigModule } from './config/config.module.js'
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module.js'
import { ValidUrlModule } from './valid-url/valid-url.module.js'
import { AuthorizationModule } from './authorization/authorization.module.js'
import { RateLimitModule } from './rate-limit/rate-limit.module.js'
import { StatusModule } from './status/status.module.js'
import { AdminModule } from './admin/admin.module.js'
import { FrontendModule } from './frontend/frontend.module.js'
import { RedirectModule } from './redirect/redirect.module.js'

/**
 * Root application module. It is created dynamically so that the caller-provided
 * Fastify instance and the runtime options can be injected into the providers
 * that need them (via the APP_OPTIONS and FASTIFY_INSTANCE tokens).
 */
@Module({})
export class AppModule {
  static forRoot (fastify: FastifyInstance, opts: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RuntimeModule.forRoot(fastify, opts),
        ConfigModule,
        ElasticsearchModule,
        ValidUrlModule,
        AuthorizationModule,
        RateLimitModule,
        StatusModule,
        AdminModule,
        FrontendModule,
        RedirectModule
      ]
    }
  }
}
