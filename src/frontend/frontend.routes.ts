import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Inject, Injectable } from '@nestjs/common'
import Static from '@fastify/static'
import Helmet from '@fastify/helmet'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ConfigService } from '../config/config.service.js'
import { AuthorizationService } from '../authorization/authorization.service.js'
import { FASTIFY_INSTANCE } from '../fastify.provider.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
// Compiled file lives at repo/dist/frontend/frontend.routes.js, so the
// public directory is two levels up from here.
const publicDir = join(currentDir, '..', '..', 'public')

interface OAuthToken {
  access_token: string
}

interface GithubOAuth {
  getAccessTokenFromAuthorizationCodeFlow (req: FastifyRequest): Promise<OAuthToken>
}

/**
 * Serves the frontend of the application. It registers the static file
 * serving and helmet security header plugins in its own encapsulated
 * scope, then exposes the OAuth callback and the bundle route.
 */
@Injectable()
export class FrontendRoutes {
  constructor (
    private readonly configService: ConfigService,
    private readonly authorization: AuthorizationService,
    @Inject(FASTIFY_INSTANCE) private readonly root: FastifyInstance
  ) {}

  async register (fastify: FastifyInstance): Promise<void> {
    const autoPrefix = '/_app'
    const config = this.configService.config
    const isUserAllowed = this.authorization.isUserAllowed

    await fastify.register(async (instance: FastifyInstance): Promise<void> => {
      await instance.register(Helmet as never, {
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            frameSrc: ["'self'"],
            scriptSrc: [
              "'self'",
              "'unsafe-eval'",
              'https://unpkg.com'
            ],
            fontSrc: [
              "'self'",
              'data:',
              'https://www.gstatic.com',
              'https://fonts.gstatic.com',
              'https://fonts.googleapis.com'
            ],
            connectSrc: [
              "'self'",
              'https://unpkg.com'
            ],
            imgSrc: ["'self'"],
            styleSrc: [
              "'self'",
              "'unsafe-inline'",
              'https://www.gstatic.com',
              'https://fonts.googleapis.com',
              'https://unpkg.com'
            ]
          }
        }
      })

      await instance.register(Static as never, {
        root: publicDir,
        prefix: '/public'
      })

      instance.route({
        method: 'GET',
        url: '/login/github/callback',
        handler: async function onLoginCallback (req: FastifyRequest, reply: FastifyReply) {
          const github = (this as unknown as { github: GithubOAuth }).github
          const token = await github.getAccessTokenFromAuthorizationCodeFlow(req)
          await isUserAllowed(token.access_token)

          reply.setCookie('user_session', token.access_token, {
            secure: config.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: true,
            path: '/_app',
            signed: true,
            maxAge: 604800,
            expires: new Date(Date.now() + 604800 * 1000)
          })

          return reply.redirect(autoPrefix)
        }
      })

      instance.route({
        method: 'GET',
        url: '/',
        handler: function onBundle (req: FastifyRequest, reply: FastifyReply) {
          reply.header('X-Robots-Tag', 'noindex, nofollow')
          return (reply as FastifyReply & { sendFile (file: string): FastifyReply }).sendFile('index.html')
        }
      })
    }, { prefix: autoPrefix })
  }
}
