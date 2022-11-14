const { BaseAppTest, runTests } = require('./base-test')

function getURI (path) {
  return `/unittest${path}`
}

class CorsTest extends BaseAppTest {
  async testCORS () {
    const app = this.app
    async function check (path, expOrigin, expHeaders) {
      const apiPath = getURI('/api/cors/' + path)
      let req = app.post(apiPath)
      if (path === 'one') {
        req = req.set('x-key', '123')
      }
      const resp = await req.expect(200)

      function checkHeaders (headers) {
        expect(headers['access-control-allow-origin']).toEqual(expOrigin)
        expect(headers['access-control-allow-headers']).toBe(expHeaders)
      }
      checkHeaders(resp.headers)

      if (path === 'nope') {
        // no OPTIONS API either then
        await app.options(apiPath).expect(404)
      } else {
        const optionsResp = await app.options(apiPath).expect(200)
        checkHeaders(optionsResp.headers)
      }
    }
    await check('nope') // check that the default is no CORS headers
    await check('any', '*', 'Content-Type')
    // on localhost the origin gets converted to localhost
    await check('one', 'http://localhost:3000', 'Content-Type, x-key')
    await check('noAppHeader', 'http://localhost:3000', 'Content-Type, X-More')
    await check('webApp', 'http://localhost:3000', 'Content-Type')
    await check('headers', 'http://localhost:3000', 'X-One, X-Two')
    await check('noHeaders', 'http://localhost:3000')
  }
}

runTests(CorsTest)
