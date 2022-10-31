const fp = require('fastify-plugin')
const symbolRequestTime = Symbol('RequestTimer')

module.exports = fp(function (fastify, options, next) {
  fastify.addHook('onRequest', function onRequestHandler (req, reply, done) {
    // Start the recording of process time
    req.raw[symbolRequestTime] = process.hrtime.bigint()

    done()
  })

  fastify.addHook('onResponse', (req, reply, done) => {
    // if errored, then it was already logged
    if (!reply.raw.logged) {
      req.log.info({
        req: req,
        status: reply.raw.statusCode,
        latency: reply.getHeader('x-latency-ms')
      })
    }
    done()
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    const fixedDigits = 3
    // Calculate the duration, in nanoseconds
    const hrDuration = process.hrtime.bigint() - req.raw[symbolRequestTime]
    // convert it to milliseconds
    const duration = (Number(hrDuration) / 1e6).toFixed(fixedDigits)
    // add the header to the response
    reply.header('x-latency-ms', duration)
    return payload
  })
  next()
}, {
  fastify: '>=3.x',
  name: 'latency-tracker'
})
