import { Injectable } from '@nestjs/common'
import RateLimit from '@fastify/rate-limit'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Client } from '@elastic/elasticsearch'
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service.js'

interface StoreOptions {
  timeWindow: number
  [key: string]: unknown
}

/**
 * Rate limiting for the public internet. We reuse Elasticsearch as the
 * backing store to avoid adding infrastructure, so a custom store is
 * required (Elasticsearch is not an officially supported store).
 */
@Injectable()
export class RateLimitService {
  constructor (private readonly elasticsearch: ElasticsearchService) {}

  async register (fastify: FastifyInstance): Promise<void> {
    const elastic: Client = this.elasticsearch.client
    const indices = this.elasticsearch.indices

    class ElasticsearchStore {
      options: StoreOptions

      constructor (options: StoreOptions) {
        this.options = options
      }

      // Called on each request. We use the update API so a single call can
      // create-or-update-and-read the counter, keeping requests to at most
      // two (usually one) per `incr`.
      incr (ip: string, callback: (err: Error | null, result?: { current: number, ttl: number }) => void): void {
        const { timeWindow } = this.options
        elastic.update({
          index: indices.RATELIMIT,
          id: ip,
          _source: true,
          script: {
            lang: 'painless',
            source: 'ctx._source.current += 1'
          },
          upsert: {
            current: 1,
            ttl: Date.now() + timeWindow
          }
        }, onIncrement as never)

        function onIncrement (err: Error | null, result: { get: { _source: { current: number, ttl: number } } }): void {
          if (err) return callback(err)
          const { current, ttl } = result.get._source
          if (ttl < Date.now()) {
            elastic.update({
              index: indices.RATELIMIT,
              id: ip,
              _source: true,
              doc: {
                current: 1,
                ttl: Date.now() + timeWindow
              }
            }, onIncrement as never)
          } else {
            callback(null, { current, ttl })
          }
        }
      }

      child (routeOptions: Partial<StoreOptions>): ElasticsearchStore {
        return new ElasticsearchStore({ ...this.options, ...routeOptions })
      }
    }

    // `@fastify/rate-limit` only allows JSON error responses. Since we serve
    // a frontend, we intercept errored responses via `setErrorHandler` and
    // send back an html page for the 429 case.
    fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (error.statusCode === 429) {
        return reply
          .code(429)
          .type('text/html')
          .send(get429Page(error.message))
      }
      reply.send(error)
    })

    await fastify.register(RateLimit as never, {
      allowList: ['127.0.0.1'],
      store: ElasticsearchStore as never,
      timeWindow: '1 minute',
      max: 10
    })
  }
}

function get429Page (message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset='utf-8'>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Too Many Requests</title>
  <link rel="preconnect" href="https://fonts.gstatic.com">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;900&display=swap" rel="stylesheet">
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      font-family: 'Montserrat', sans-serif;
      font-size: 25px;
    }

    main {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

   h1 {
      background: linear-gradient(90deg, #d53369 0%, #daae51 100%);
     -webkit-background-clip: text;
       -moz-background-clip: text;
      background-clip: text;
     -webkit-text-fill-color: transparent;
      -moz-text-fill-color: transparent;
      text-fill-color: transparent;
      color: #d53369;
    }
  </style>
</head>
<body>
  <main>
    <h1>Hey, slow down!</h1>
    <p>${message}</p>
  </main>
</body>
</html>`
}
