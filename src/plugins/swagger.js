// istanbul ignore file
const swagger = require('@fastify/swagger')
const swaggerUI = require('@fastify/swagger-ui')
const fp = require('fastify-plugin')

module.exports = fp(function (fastify, options, next) {
  if (options.swagger.disabled) {
    next()
    return
  }

  const authHeaders = options.swagger.authHeaders
  fastify.register(swagger, {
    openapi: {
      servers: options.swagger.servers.map(x => { return { url: x } }),
      info: {
        title: `${options.swagger.service.toUpperCase()} Service`
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
      }
    }
  })
  fastify.register(swaggerUI, {
    routePrefix: options.swagger.routePrefix,
    exposeRoute: true,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
      filter: true
    }
  })
  // fastify.addHook('onReady', function (done) {
  //   fastify.swagger()
  //   done()
  // })
  next()
}, {
  fastify: '>=3.x',
  name: 'swagger'
})
