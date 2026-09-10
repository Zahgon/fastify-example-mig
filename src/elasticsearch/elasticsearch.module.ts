import { Global, Module } from '@nestjs/common'
import { ElasticsearchService } from './elasticsearch.service.js'

/**
 * Exposes the Elasticsearch client and index names application-wide.
 * Declared `@Global` because many features depend on the datastore,
 * mirroring the non-encapsulated `elasticsearch` plugin of the original
 * application (`fastify.elastic` / `fastify.indices`).
 */
@Global()
@Module({
  providers: [ElasticsearchService],
  exports: [ElasticsearchService]
})
export class ElasticsearchModule {}
