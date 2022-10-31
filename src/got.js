const zlib = require('zlib')

const got = require('got')

module.exports = (options) => {
  options = {
    decompress: true,
    ...options
  }
  if (options.compress) {
    const headers = {
      'content-encoding': 'br',
      ...options.headers
    }
    options.headers = headers
    if (options.body) {
      options.body = zlib.brotliCompressSync(options.body)
    }
    if (options.json) {
      headers['content-type'] = 'application/json'
      options.body = zlib.brotliCompressSync(JSON.stringify(options.json))
      delete options.json
    }
  }
  return got(options)
}
