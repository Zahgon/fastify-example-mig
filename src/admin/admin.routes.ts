/* eslint camelcase: 0 */
import fluentSchema, { type S as SchemaFactory } from 'fluent-json-schema'
import { Injectable } from '@nestjs/common'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service.js'
import { ValidUrlService } from '../valid-url/valid-url.service.js'
import { AuthorizationService } from '../authorization/authorization.service.js'

// Normalise fluent-json-schema's default export: its NodeNext typings resolve
// the default import to the module namespace rather than the callable schema
// factory, so we retype it via the exported `S` factory interface.
const S = fluentSchema as unknown as SchemaFactory

interface RedirectBody {
  source: string
  destination: string
  isPrivate: boolean
}

interface DeleteBody {
  source: string
}

interface RedirectsQuery {
  from: number
  size: number
}

/**
 * Registers all the CRUD operations needed to make the url shortener work.
 * It also exposes a `/refresh` route to get the csrf token that should be
 * sent to every other API. All routes are protected by the authorization
 * hook and, where relevant, by CSRF protection.
 */
@Injectable()
export class AdminRoutes {
  constructor (
    private readonly elasticsearch: ElasticsearchService,
    private readonly validUrl: ValidUrlService,
    private readonly authorization: AuthorizationService
  ) {}

  async register (fastify: FastifyInstance): Promise<void> {
    const { httpErrors } = fastify
    const { client: elastic, indices } = this.elasticsearch
    const { csrfProtection } = fastify
    const authorize = this.authorization.authorize
    const isValidUrl = (url: string): Promise<boolean> => this.validUrl.isValidUrl(url)

    const isValidSource = (source: string): void => {
      const noSlashSource = source.replace(/\//g, '')
      if (encodeURIComponent(noSlashSource) !== noSlashSource) {
        throw httpErrors.badRequest('The source contains unsafe url characters')
      }
      if (source.split('/')[1] === '_app') {
        throw httpErrors.badRequest('The source cannot contain the private string "_app"')
      }
    }

    await fastify.register(async function admin (instance: FastifyInstance): Promise<void> {
      // Every route inside this plugin should be protected by the
      // authorization logic. We run it as an onRequest hook.
      instance.addHook('onRequest', authorize)

      instance.route({
        method: 'GET',
        url: '/refresh',
        schema: {
          description: 'Route used by the frontend app to validate the session' +
                       ' and retrieve the CSRF token.',
          response: {
            200: S.object().prop('csrfToken', S.string())
          }
        },
        handler: async function onRefresh (req: FastifyRequest, reply: FastifyReply) {
          const csrfToken = await reply.generateCsrf()
          return { csrfToken }
        }
      })

      instance.route({
        method: 'PUT',
        url: '/redirect',
        config: { rateLimit: false },
        onRequest: csrfProtection,
        schema: {
          description: 'Adds a new redirect',
          body: S.object()
            .prop('source', S.string().required())
            .prop('destination', S.string().required())
            .prop('isPrivate', S.boolean().default(false)),
          response: {
            201: S.object().prop('created', S.boolean())
          }
        },
        handler: async function onAddRedirect (req: FastifyRequest, reply: FastifyReply) {
          const { source, destination, isPrivate } = req.body as RedirectBody
          const user = (req as FastifyRequest & { user: { mail: string } }).user

          req.log.info(`Adding new redirect from user ${user.mail}`)

          isValidSource(source)
          if (!(await isValidUrl(destination))) {
            throw httpErrors.badRequest('The destination is not a valid url')
          }

          const { statusCode } = await elastic.create({
            index: indices.SHORTURL,
            id: source,
            refresh: 'wait_for',
            document: {
              source,
              destination,
              isPrivate,
              created: new Date(),
              count: 0,
              user: user.mail
            }
          }, {
            ignore: [409],
            meta: true
          })

          if (statusCode === 409) {
            throw httpErrors.conflict('The source already exists')
          }

          reply.code(201)
          return { created: true }
        }
      })

      instance.route({
        method: 'POST',
        url: '/redirect',
        config: { rateLimit: false },
        onRequest: csrfProtection,
        schema: {
          description: 'Updates an existing redirect',
          body: S.object()
            .prop('source', S.string().required())
            .prop('destination', S.string().required())
            .prop('isPrivate', S.boolean().default(false)),
          response: {
            200: S.object().prop('updated', S.boolean())
          }
        },
        handler: async function onEditRedirect (req: FastifyRequest, reply: FastifyReply) {
          const { source, destination, isPrivate } = req.body as RedirectBody

          isValidSource(source)
          if (!(await isValidUrl(destination))) {
            throw httpErrors.badRequest('The destination is not a valid url')
          }

          const { statusCode } = await elastic.update({
            index: indices.SHORTURL,
            id: source,
            refresh: 'wait_for',
            doc: { source, destination, isPrivate }
          }, { ignore: [404], meta: true })

          if (statusCode === 404) {
            throw httpErrors.notFound(`There is no destination with source ${source}`)
          }

          return { updated: true }
        }
      })

      instance.route({
        method: 'DELETE',
        url: '/redirect',
        config: { rateLimit: false },
        onRequest: csrfProtection,
        schema: {
          description: 'Removes an existing redirect',
          body: S.object().prop('source', S.string().required()),
          response: {
            200: S.object().prop('deleted', S.boolean())
          }
        },
        handler: async function onDeleteRedirect (req: FastifyRequest, reply: FastifyReply) {
          const { source } = req.body as DeleteBody
          isValidSource(source)

          const { statusCode } = await elastic.delete({
            index: indices.SHORTURL,
            id: source,
            refresh: 'wait_for'
          }, { ignore: [404], meta: true })

          if (statusCode === 404) {
            throw httpErrors.notFound(`The source ${source} does not exists`)
          }

          return { deleted: true }
        }
      })

      instance.route({
        method: 'GET',
        url: '/redirects',
        config: { rateLimit: false },
        onRequest: csrfProtection,
        schema: {
          description: 'Get all the redirects defined by the current user.',
          querystring: S.object()
            .prop('from', S.integer().minimum(0).default(0))
            .prop('size', S.integer().minimum(0).default(10)),
          response: {
            200: S.object()
              .prop('count', S.integer())
              .prop('redirects', S.array().items(
                S.object()
                  .prop('source', S.string())
                  .prop('destination', S.string())
                  .prop('isPrivate', S.boolean())
                  .prop('count', S.integer())
                  .prop('created', S.string())
              ))
          }
        },
        handler: async function onGetRedirects (req: FastifyRequest, reply: FastifyReply) {
          const { from, size } = req.query as RedirectsQuery
          const user = (req as FastifyRequest & { user: { mail: string } }).user
          const result = await elastic.search({
            index: indices.SHORTURL,
            from,
            size,
            query: {
              term: { user: user.mail }
            },
            sort: 'source.raw'
          })

          const total = result.hits.total as { value: number }
          return {
            count: total.value,
            redirects: result.hits.hits.map(entry => entry._source)
          }
        }
      })
    }, { prefix: '/_app' })
  }
}
