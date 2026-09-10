import Fastify from 'fastify'
import app from './app.js'

/**
 * Standalone entry point that boots the application over HTTP. The application
 * itself is a Fastify plugin (backed by NestJS on the Fastify adapter), so we
 * create a Fastify instance, register the plugin and start listening.
 */
const fastify = Fastify({ logger: true })

await fastify.register(app)

const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

try {
  await fastify.listen({ port, host })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
