/* eslint camelcase: 0 */
import { Inject, Injectable } from '@nestjs/common'
import { Client } from 'undici'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ConfigService } from '../config/config.service.js'
import { APP_OPTIONS, type AppOptions } from '../app-options.js'
import { FASTIFY_INSTANCE } from '../fastify.provider.js'

interface GithubEmail {
  email: string
  primary?: boolean
}

@Injectable()
export class AuthorizationService {
  private readonly allowedUsers: string[]
  private readonly client = new Client('https://api.github.com')

  constructor (
    private readonly configService: ConfigService,
    @Inject(APP_OPTIONS) private readonly opts: AppOptions,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: FastifyInstance
  ) {
    this.allowedUsers = configService.config.ALLOWED_USERS.split(',')
  }

  authorize = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const { httpErrors } = this.fastify
    const { user_session: userSession } = req.cookies

    if (!userSession) {
      throw httpErrors.unauthorized('Missing session cookie')
    }

    const cookie = req.unsignCookie(userSession)
    if (!cookie.valid) {
      throw httpErrors.unauthorized('Invalid cookie signature')
    }

    let mail: string
    try {
      mail = await this.isUserAllowed(cookie.value as string)
    } catch (err) {
      req.log.warn(`Invalid user tried to authenticate: ${JSON.stringify((err as { user?: unknown }).user)}`)
      reply.clearCookie('user_session', { path: '/_app' })
      throw err
    }

    ;(req as FastifyRequest & { user: { mail: string } }).user = { mail }
  }

  isUserAllowed = async (token: string): Promise<string> => {
    return this.opts.testing
      ? this.isUserAllowedMock(token)
      : this.isUserAllowedReal(token)
  }

  private async isUserAllowedReal (token: string): Promise<string> {
    const { httpErrors } = this.fastify
    const { statusCode, body } = await this.client.request({
      method: 'GET',
      path: '/user/emails',
      headers: {
        'User-Agent': 'fastify-example',
        Authorization: `Bearer ${token}`
      }
    })

    if (statusCode >= 400) {
      throw httpErrors.unauthorized('Authenticate again')
    }

    let raw = ''
    body.setEncoding('utf8')
    for await (const chunk of body) {
      raw += chunk
    }
    const payload = JSON.parse(raw) as GithubEmail[]

    const isAllowed = payload.some(ele => this.allowedUsers.includes(ele.email))
    if (!isAllowed) {
      const err = httpErrors.forbidden('You are not allowed to access this') as Error & { user?: unknown }
      err.user = payload
      throw err
    }

    for (const ele of payload) {
      if (ele.primary) {
        return ele.email
      }
    }

    throw httpErrors.badRequest('The user does not have a primary email')
  }

  private isUserAllowedMock (token: string): string {
    if (token === 'invalid') {
      throw this.fastify.httpErrors.forbidden('You are not allowed to access this')
    }
    return this.allowedUsers[0]
  }
}
