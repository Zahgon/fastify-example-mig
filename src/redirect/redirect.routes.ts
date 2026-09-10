import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Injectable } from '@nestjs/common'
import Piscina from 'fastify-piscina'
import { Readable } from 'readable-stream'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
// Compiled file lives at repo/dist/redirect/redirect.routes.js, so the
// piscina worker is two levels up from here.
const workerFile = join(currentDir, '..', '..', 'routes', 'redirect', 'worker.cjs')

interface RedirectSource {
  source: string
  destination: string
  isPrivate: boolean
}

interface SearchHit {
  _source: RedirectSource
}

/**
 * Handles the public redirect routes. It resolves a short url to its
 * destination, offering suggestions via a piscina worker thread when the
 * exact source is not found, and updates the redirect analytics count.
 */
@Injectable()
export class RedirectRoutes {
  constructor (private readonly elasticsearch: ElasticsearchService) {}

  async register (fastify: FastifyInstance): Promise<void> {
    const elastic = this.elasticsearch.client
    const indices = this.elasticsearch.indices

    await fastify.register(async function short (instance: FastifyInstance): Promise<void> {
      await instance.register(Piscina as never, {
        filename: workerFile
      })

      const updateCountStream = new Readable({
        objectMode: true,
        read (size: number): void {}
      })

      const updateCountUpdater = elastic.helpers.bulk({
        datasource: updateCountStream as never,
        flushBytes: 1000000,
        flushInterval: 5000,
        onDocument (doc: { id: string }) {
          return [
            { update: { _index: indices.SHORTURL, _id: doc.id } },
            { doc: undefined, script: { lang: 'painless', source: 'ctx._source.count += 1' } }
          ]
        },
        onDrop (doc: unknown) {
          instance.log.warn(doc, 'dropped redirect analytics record')
        }
      })

      updateCountUpdater.catch((err: Error) => {
        instance.log.error(err, 'updateCountUpdater throwed an error')
        process.exit(1)
      })

      instance.addHook('onClose', (inst, done) => {
        updateCountStream.push(null)
        updateCountUpdater.then(() => done())
      })

      instance.decorate('updateCount', (id: string): void => {
        updateCountStream.push({ id })
      })

      async function noMatches (this: FastifyReply): Promise<string> {
        const runTask = (instance as unknown as { runTask (arg: unknown): Promise<string> }).runTask
        const html = await runTask([])
        this.code(404)
        this.type('text/html')
        return html
      }

      async function suggest (this: FastifyReply, suggestions: RedirectSource[]): Promise<string> {
        const runTask = (instance as unknown as { runTask (arg: unknown): Promise<string> }).runTask
        const html = await runTask(suggestions)
        this.code(404).type('text/html')
        return html
      }

      instance.decorateReply('noMatches', noMatches)
      instance.decorateReply('suggest', suggest)

      instance.route({
        method: 'GET',
        url: '/*',
        handler: async function onGetUrl (req: FastifyRequest, reply: FastifyReply) {
          const source = (req.params as Record<string, string>)['*']
          if (source === '') {
            return reply.redirect('https://github.com/delvedor/fastify-example')
          }

          const result = await elastic.search({
            index: indices.SHORTURL,
            query: {
              match: {
                source: {
                  query: source,
                  fuzziness: 'AUTO'
                }
              }
            }
          })

          const total = result.hits.total as { value: number }
          if (total.value === 0) {
            return (reply as FastifyReply & { noMatches (): Promise<string> }).noMatches()
          }

          const { _source: firstMatch } = result.hits.hits[0] as SearchHit
          if (firstMatch.source !== source) {
            const suggestions = (result.hits.hits as SearchHit[])
              .filter(url => !url._source.isPrivate)
              .map(url => url._source)
            return suggestions.length > 0
              ? (reply as FastifyReply & { suggest (s: RedirectSource[]): Promise<string> }).suggest(suggestions)
              : (reply as FastifyReply & { noMatches (): Promise<string> }).noMatches()
          }

          ;(this as unknown as { updateCount (id: string): void }).updateCount(firstMatch.source)
          return reply.redirect(firstMatch.destination)
        }
      })
    })
  }
}
