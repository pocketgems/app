const S = require('@pocketgems/schema')

const { API, EXCEPTIONS: { RequestDone } } = require('..')

const { BaseAppTest, runTests } = require('./base-test')

function getURI (path) {
  return `/unit-test${path}`
}

class PaginationTest extends BaseAppTest {
  async testPagination () {
    const app = this.app
    async function helper (nextToken, expected) {
      const postfix = nextToken ? `&nextToken=${nextToken}` : ''
      const ret = await app.post(getURI('/paginated?amount=10' + postfix))
        .expect(200)
      expect(ret.body).toEqual(expected)
    }
    await helper(undefined, { nextToken: '1', list: ['1'] })
    await helper('1', { nextToken: '2', list: ['2'] })
    await helper('2', { nextToken: '3', list: ['3'] })
    await helper('3', { list: ['done'] })
  }

  async testPaginationPrerequisite () {
    let paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = undefined
    }
    expect(() => paginatedAPI._getResponse())
      .toThrow('has no response while pagination is enabled')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = {}
    }
    expect(() => paginatedAPI._getResponse())
      .toThrow('must have one key in response since pagination')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = { a: S.str }
    }
    expect(() => paginatedAPI._getResponse())
      .toThrow('must have one key that is an array schema')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = {
        a: S.arr(S.str),
        b: S.int
      }
    }
    expect(() => paginatedAPI._getResponse())
      .toThrow('must have one key in response since pagination')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = { nextToken: S.int }
    }
    expect(() => paginatedAPI._getResponse())
      .toThrow('must not use reserved key "nextToken" in response')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = class extends RequestDone {
        static SCHEMA = undefined
      }
    }
    expect(() => paginatedAPI._getResponse())
      .toThrow('has no response while pagination ')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static QS = { nextToken: S.int }
      static RESPONSE = { list: S.arr(S.str) }
    }
    expect(() => paginatedAPI._QUERY_STRING)
      .toThrow('nextToken is reserved for ENABLE_PAGINATION flag')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static QS = { amount: S.int }
      static RESPONSE = { list: S.arr(S.str) }
    }
    expect(() => paginatedAPI._QUERY_STRING)
      .toThrow('amount is reserved for ENABLE_PAGINATION flag')

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = { list: S.arr(S.str) }
    }
    const body = paginatedAPI._QUERY_STRING
    expect(body.nextToken).toBeDefined()
    expect(body.amount).toBeDefined()

    paginatedAPI = class extends API {
      static ENABLE_PAGINATION = true
      static RESPONSE = class extends RequestDone {
        static SCHEMA = { a: S.arr(S.str) }
      }
    }
    const resp = paginatedAPI._getResponse()
    expect(resp.SCHEMA.nextToken).toBeDefined()
  }
}

runTests(PaginationTest)
