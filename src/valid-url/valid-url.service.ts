import { Injectable } from '@nestjs/common'
import http from 'http'
import https from 'https'

/**
 * This application is a url shortener, and we want to be sure that
 * a destination url exists before storing it in Elasticsearch.
 * This service exposes a single `isValidUrl` method that performs
 * an http request to the destination url to figure out if it is valid.
 * We are not using `undici` as the client (like in the authorization
 * feature) because undici is best suited for calling the same endpoint
 * multiple times, while the Node.js core http client can talk with
 * multiple addresses more easily.
 */
@Injectable()
export class ValidUrlService {
  isValidUrl (url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const protocol = url.slice(0, 5) === 'https' ? https : http
      const request = protocol.get(url)

      const onResponse = (response: http.IncomingMessage): void => {
        cleanListeners()
        response.destroy() // We don't care about the response.
        resolve((response.statusCode ?? 0) < 400)
      }

      const onTimeout = (): void => {
        cleanListeners()
        request.once('error', () => {}) // we need to catch the request aborted error
        request.abort()
        resolve(false)
      }

      const onError = (): void => {
        cleanListeners()
        resolve(false)
      }

      const onAbort = (): void => {
        cleanListeners()
        request.once('error', () => {}) // we need to catch the request aborted error
        resolve(false)
      }

      request.on('response', onResponse)
      request.on('timeout', onTimeout)
      request.on('error', onError)
      request.on('abort', onAbort)

      request.end()

      // Let's be good citizens and clean the listeners,
      // so we free memory and avoid memory leaks.
      function cleanListeners (): void {
        request.removeListener('response', onResponse)
        request.removeListener('timeout', onTimeout)
        request.removeListener('error', onError)
        request.removeListener('abort', onAbort)
      }
    })
  }
}
