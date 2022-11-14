const fp = require('fastify-plugin')

module.exports = fp(function (fastify, options, next) {
  // istanbul ignore if
  if (options.healthCheck.disabled) {
    next()
    return
  }
  // istanbul ignore next
  const path = options.healthCheck.path ?? '/'
  fastify.get(path, { schema: { hide: true } },
    async (req, reply) => {
      reply.send()
    })
  next()
}, {
  fastify: '>=3.x',
  name: 'healthCheck'
})
