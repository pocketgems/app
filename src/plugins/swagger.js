// istanbul ignore file
const fp = require('fastify-plugin')
const swagger = require('fastify-swagger')

module.exports = fp(function (fastify, options, next) {
  if (options.swagger.disabled) {
    next()
    return
  }

  const authHeaders = options.swagger.authHeaders
  fastify.register(swagger, {
    routePrefix: '/docs',
    exposeRoute: true,
    openapi: {
      servers: options.swagger.servers.map(x => { return { url: x } }),
      info: {
        title: `${options.swagger.service} Service`,
        version: 'Version ' + (process.env.SERVICE_VERSION || 'default')
      },
      consumes: ['application/json'],
      produces: ['application/json'],
      components: {
        securitySchemes: authHeaders.reduce((all, c) => {
          all[c.replace('x-', '')] = {
            type: 'apiKey',
            name: c,
            in: 'header'
          }
          return all
        }, {})
      },
      uiConfig: {
        docExpansion: 'full',
        deepLinking: false
      }
    }
  })
  fastify.addHook('onReady', function (done) {
    fastify.swagger()
    done()
  })
  next()
}, {
  fastify: '>=3.x',
  name: 'swagger'
})
