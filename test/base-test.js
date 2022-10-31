const { BaseTest, runTests } = require('@pocketgems/unit-test')
const superagentDefaults = require('superagent-defaults')
const supertest = require('supertest')

let FASTIFY_CACHE

afterAll(async () => {
  await FASTIFY_CACHE?.close()
  FASTIFY_CACHE = undefined
})

class BaseAppTest extends BaseTest {
  static async requireApp () {
    return require('../src/app')
  }

  async beforeAll () {
    this.fastify = FASTIFY_CACHE ?? await this.constructor.requireApp()
    FASTIFY_CACHE = this.fastify

    await Promise.all([super.beforeAll(), this.fastify.ready()])

    /**
     * Avoid having to consider compression in unit tests
     * by removing the `accept-encoding` header,
     * which is added by default from SuperTest
     */
    const superTest = superagentDefaults(supertest(this.fastify.server))
    superTest.set('accept-encoding', null)
    this.app = new Proxy(superTest, {
      get: (target, prop, receiver) => {
        if (['get', 'post', 'put', 'delete'].includes(prop)) {
          return (...requestParams) => {
            const test = target[prop](...requestParams)
            const originalExpect = test.expect
            test.expect = async (...expectParams) => {
              console.log('  \u2502 Expecting', expectParams[0])
              return originalExpect.call(test, ...expectParams)
            }
            return test
          }
        } else {
          return target[prop]
        }
      }
    })
  }
}

// the promise input conveniently matches the promise produced by supertest
// so you can pass the output of app.post(), etc. as the promise here as is
function makeGotMockValueFromPromise (promise) {
  const mockValue = new Promise(resolve => {
    promise.then(desiredHttpResponse => {
      let body = desiredHttpResponse.text || desiredHttpResponse.body || ''
      if (typeof body !== 'string') {
        body = JSON.stringify(body)
      }
      mockValue.text = async () => body
      resolve({ statusCode: desiredHttpResponse.status || 200 })
    })
  })
  return mockValue
}

function makeGotMockValue (body, statusCode, callback) {
  const mockValue = new Promise(resolve => {
    // setTimeout is used so that this promise does not synchronously resolve
    // because unmocked got will NEVER return synchronously. This ensures
    // functions which call got() never resolve synchronously (which can
    // change their behavior... e.g., allow them to throw when called,
    // instead of only rejecting later when await'ed).
    // https://github.com/facebook/jest/issues/6028 (since jest 21.x)
    setTimeout(() => {
      mockValue.text = async () => {
        if (callback) {
          callback()
        }
        if (typeof body === 'string') {
          return body
        }
        return JSON.stringify(body)
      }
      resolve({ statusCode })
    }, 0)
  })
  mockValue.text = async () => {
    throw new Error('cannot use text() before calling await() on the response')
  }
  return mockValue
}

function mockGot () {
  const got = require('../src/got')
  jest.mock('../src/got')
  got.mockResp = (body = '', statusCode = 200, callback) => {
    got.mockReturnValue(makeGotMockValue(body, statusCode, callback))
  }

  /**
   * Determine the mock response to use when the request is made.
   *
   * @param  {...function (request)} callbacks a list of callbacks in the order
   *   to check and see if they have a mock response to use; if no callback,
   *   provides a mock response then an error will be thrown
   */
  got.mockRespWithCallback = (...callbacks) => {
    got.mockImplementation(request => {
      for (const callback of callbacks) {
        const desiredHTTPResponse = callback(request)
        if (desiredHTTPResponse === true) {
          const unmockedGot = jest.requireActual('../src/got')
          return unmockedGot(request)
        }
        if (desiredHTTPResponse) {
          if (desiredHTTPResponse.then) {
            return makeGotMockValueFromPromise(desiredHTTPResponse)
          }
          return makeGotMockValue(
            // follows the names from supertest
            desiredHTTPResponse.text || desiredHTTPResponse.body || '',
            desiredHTTPResponse.status || 200)
        }
      }
      throw new Error(`un-mocked got() request: ${JSON.stringify(request)}`)
    })
  }

  // will respond to the next N requests with the specified N responses
  got.mockRespMulti = (...responses) => {
    let idx = 0
    function setupNextResponse () {
      if (idx < responses.length) {
        got.mockResp(...responses[idx], setupNextResponse)
      } else if (idx > responses.length) {
        // exactly equal means we just got our last callback (okay)
        throw new Error('more requests made than we had mock responses')
      }
      idx += 1
    }
    setupNextResponse()
  }
  return got
}

module.exports = {
  BaseAppTest,
  BaseTest,
  mockGot,
  runTests
}
