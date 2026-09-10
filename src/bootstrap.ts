import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import Sensible from '@fastify/sensible'
import Cookie from '@fastify/cookie'
import Csrf from '@fastify/csrf-protection'
import OAuth from '@fastify/oauth2'
import type { FastifyInstance } from 'fastify'
import { AppModule } from './app.module.js'
import { AppOptions } from './app-options.js'
import { ConfigService } from './config/config.service.js'
import { ElasticsearchService } from './elasticsearch/elasticsearch.service.js'
import { RateLimitService } from './rate-limit/rate-limit.service.js'
import { AdminRoutes } from './admin/admin.routes.js'
import { FrontendRoutes } from './frontend/frontend.routes.js'
import { RedirectRoutes } from './redirect/redirect.routes.js'

/**
 * Bootstraps the NestJS application on top of the provided Fastify instance.
 *
 * The original application was a Fastify plugin, and the test harness still
 * registers this bootstrap as a plugin so that it can inject requests and read
 * the decorators. NestJS genuinely owns the dependency injection container,
 * modules, controllers, and providers, while the Fastify-native concerns
 * (plugins, decorators, wildcard routes) are wired onto the same underlying
 * instance in the exact order the original entry point used.
 */
export default async function bootstrap (
  fastify: FastifyInstance,
  opts: AppOptions
): Promise<FastifyInstance> {
  // Build the NestJS application over the caller-provided Fastify instance so
  // the dependency injection container and the HTTP engine share the same
  // instance the tests inject into.
  const adapter = new FastifyAdapter(fastify as never)
  const nestApp = await NestFactory.create(
    AppModule.forRoot(fastify, opts),
    adapter,
    { logger: false }
  )

  // Resolve the providers that own the ported behavior.
  const configService = nestApp.get(ConfigService)
  const elasticsearch = nestApp.get(ElasticsearchService)
  const rateLimit = nestApp.get(RateLimitService)
  const admin = nestApp.get(AdminRoutes)
  const frontend = nestApp.get(FrontendRoutes)
  const redirect = nestApp.get(RedirectRoutes)

  const config = configService.config

  // The original entry point exposed the validated environment under
  // `fastify.config`. The ConfigService validates `process.env`, so we simply
  // mirror the result onto the instance the rest of the app expects.
  fastify.decorate('config', config)

  // `fastify-sensible` adds the nice http errors used across the app.
  // The `as never` casts normalise the plugins' CJS/ESM interop typings, which
  // NodeNext resolves to the module namespace instead of a plugin callback.
  await fastify.register(Sensible as never)

  // Expose the Elasticsearch client and index names, matching the original
  // `elasticsearch` plugin decorators.
  fastify.decorate('elastic', elasticsearch.client)
  fastify.decorate('indices', elasticsearch.indices)

  // Authorization plugin wiring: OAuth2, signed cookies, and CSRF protection.
  await fastify.register(OAuth as never, {
    name: 'github',
    credentials: {
      client: {
        id: config.GITHUB_APP_ID,
        secret: config.GITHUB_APP_SECRET
      },
      auth: (OAuth as unknown as { GITHUB_CONFIGURATION: unknown })
        .GITHUB_CONFIGURATION
    },
    startRedirectPath: '/_app/login/github',
    callbackUri: 'http://localhost:3000/_app/login/github/callback',
    scope: ['user:email']
  })

  await fastify.register(Cookie as never, {
    secret: config.COOKIE_SECRET
  })

  await fastify.register(Csrf as never, {
    sessionPlugin: '@fastify/cookie',
    cookieOpts: { signed: true }
  })

  fastify.decorateRequest('user', null)

  // Rate limiting backed by Elasticsearch, plus the 429 error handler.
  await rateLimit.register(fastify)

  // Application routes.
  await admin.register(fastify)
  await frontend.register(fastify)
  await redirect.register(fastify)

  // Runs the NestJS lifecycle hooks, including the Elasticsearch ping and
  // index configuration performed in `onModuleInit`.
  await nestApp.init()

  // Ensure the Elasticsearch client is closed together with the instance,
  // matching the original `onClose` hook (skipped while testing).
  fastify.addHook('onClose', async () => {
    await elasticsearch.close()
  })

  return fastify
}
