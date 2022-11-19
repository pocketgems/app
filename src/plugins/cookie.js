const cookiePlugin = require('@fastify/cookie')
const fp = require('fastify-plugin')

function addContentParser (fastify, options, next) {
  // istanbul ignore if
  if (options.cookie.disabled) {
    next()
    return
  }
  fastify.register(cookiePlugin, { secret: options.cookie.secret })
  next()
}

module.exports = fp(addContentParser, {
  fastify: '>=3.x',
  name: 'content-parser'
})
