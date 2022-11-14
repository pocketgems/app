const zlib = require('zlib')

const { BaseAppTest, runTests } = require('./base-test')

function getURI (path) {
  return `/unittest${path}`
}

class CompressionTest extends BaseAppTest {
  static decodeBrotli (res, callback) {
    const unzip = zlib.createBrotliDecompress()
    res.on('data', buf => {
      unzip.write(buf)
    })
    res.on('end', () => {
      unzip.flush(() => {
        const resultStr = unzip.read().toString()
        callback(null, resultStr)
      })
    })
  }

  static RAW_RESULTS = '{"canHaveArbitraryJSONContent":true,"hello":"world","address":{"houseNumber":123,"street":"Bush St"},"walkScore":3.14}'

  /**
   * Verify brotli compression is used when accept-encoding is set
   */
  async testDefaults () {
    let result = await this.app.post(getURI('/getJSON'))
      .set('accept-encoding', 'br')
      .buffer(true)
      .parse(CompressionTest.decodeBrotli)
      .set('x-app', 'test')

    expect(result.header['content-encoding']).toBe('br')
    expect(result.body).toEqual(CompressionTest.RAW_RESULTS)

    result = await this.app.post(getURI('/getJSON'))
      .set('x-app', 'test')

    expect(result.header['content-encoding']).toBeUndefined()
    expect(result.body).toEqual(JSON.parse(CompressionTest.RAW_RESULTS))
  }
}

runTests(CompressionTest)
