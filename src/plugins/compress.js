// eslint babel made changes to chained expressions which is breaking ast-types
// https://github.com/babel/babel/issues/11908

// ast-types has a fix, but it is not yet in a versioned release
// https://github.com/benjamn/ast-types/pull/399

// to circumvent problems caused by importing zlib, we do it in a separate file
// so we can ignore it in linting
const zlib = require('zlib')

const { fastifyCompress } = require('@fastify/compress')
const fp = require('fastify-plugin')

// TODO: fine tune configurations once we have a reliable usage pattern
module.exports = fp(function (fastify, options, next) {
  fastify.register(fastifyCompress, {
    threshold: 20,
    brotliOptions: {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4
      }
    }
  })
  next()
}, {
  fastify: '>=3.x',
  name: 'compress'
})
