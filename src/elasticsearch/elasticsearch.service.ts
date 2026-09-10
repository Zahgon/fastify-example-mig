import assert from 'assert'
import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { Client } from '@elastic/elasticsearch'
import { ConfigService } from '../config/config.service.js'
import { APP_OPTIONS, AppOptions } from '../app-options.js'

export interface Indices {
  SHORTURL: string
  RATELIMIT: string
}

/**
 * Exposes the Elasticsearch client, since the application uses
 * Elasticsearch as its main datastore. Besides exposing the client
 * instance it also initializes the required indices before the
 * application starts serving requests (via `onModuleInit`).
 */
@Injectable()
export class ElasticsearchService implements OnModuleInit {
  readonly client: Client
  readonly indices: Indices = {
    SHORTURL: 'fastify-app-shortened-url',
    // The rate limit index contains all the ip addresses of the users that
    // sent a request to the application. Given that this index can grow
    // in size very quickly, a good approach would be to create a new index daily
    // and configure Elasticsearch to delete the old ones with an ILM policy.
    RATELIMIT: 'fastify-app-rate-limit'
  }

  constructor (
    private readonly configService: ConfigService,
    @Inject(APP_OPTIONS) private readonly opts: AppOptions
  ) {
    const {
      ELASTIC_CLOUD_ID,
      ELASTIC_ADDRESS,
      ELASTIC_API_KEY
    } = this.configService.config

    assert(
      ELASTIC_CLOUD_ID || ELASTIC_ADDRESS,
      'You should configure either ELASTIC_CLOUD_ID or ELASTIC_ADDRESS'
    )

    this.client = new Client({
      ...(ELASTIC_CLOUD_ID && { cloud: { id: ELASTIC_CLOUD_ID } }),
      ...(ELASTIC_ADDRESS && { node: ELASTIC_ADDRESS }),
      auth: { apiKey: ELASTIC_API_KEY },
      tls: {
        rejectUnauthorized: !(ELASTIC_ADDRESS ?? '').includes('localhost:9200')
      },
      ...(this.opts.elasticMock && { Connection: this.opts.elasticMock.getConnection() as never })
    })
  }

  // We ping the cluster and configure the indices before telling
  // NestJS that the module is ready. If the ping operation fails,
  // this will throw an exception and the application won't start.
  async onModuleInit (): Promise<void> {
    await this.client.ping()
    await this.configureIndices()
  }

  /**
   * Currently we need a single index where we store our redirects, plus
   * an index for the rate limiter. The following method checks if each
   * index exists and creates it if it doesn't.
   */
  private async configureIndices (): Promise<void> {
    const { client, indices } = this
    let result = await client.indices.exists({ index: indices.SHORTURL })
    if (!result) {
      await client.indices.create({
        index: indices.SHORTURL,
        mappings: {
          properties: {
            // the short url
            source: {
              type: 'text',
              // source is defined as text, which cannot be sorted by Elasticsearch.
              // To solve this we use the multi-fields feature.
              fields: {
                raw: { type: 'keyword' }
              }
            },
            // the destination of the short url
            destination: { type: 'text' },
            // should the source appear in the 404 suggestions?
            isPrivate: { type: 'boolean' },
            // how many times a short url has been used
            count: { type: 'integer' },
            // who has created the short url
            user: { type: 'keyword' },
            // creation timestamp
            created: { type: 'date' }
          }
        }
      })
    }

    result = await client.indices.exists({ index: indices.RATELIMIT })
    if (!result) {
      await client.indices.create({
        index: indices.RATELIMIT,
        mappings: {
          properties: {
            // request count
            current: { type: 'integer' },
            // time to live of the request count
            ttl: { type: 'date' }
          }
        }
      })
    }
  }

  // Disconnect from Elasticsearch when the application is shutting down.
  // The elasticsearch mock library has a bug in the close api, so we
  // skip closing the client when running in testing mode.
  async close (): Promise<void> {
    if (!this.opts.testing) {
      await this.client.close()
    }
  }
}
