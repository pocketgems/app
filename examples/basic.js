const S = require('@pocketgems/schema')

const { API, TxAPI, EXCEPTIONS, RESPONSES } = require('..')

const SimpleAPI = require('./simple')

const {
  RequestDone,
  RequestError,
  ForbiddenException,
  UnauthorizedException,
  RedirectException
} = EXCEPTIONS

class NoOpAPI extends API {
  static PATH = '/noOp'
  static DESC = 'Does and returns nothing'
  static TAG = null
  async computeResponse () {}
}

class MultipleResponseSchemaAPI extends SimpleAPI {
  static PATH = '/multiSchema'
  static BODY = {
    code: S.int.optional(),
    respText: S.str
  }

  static DESC = 'used to test multiple response schemas'
  static RESPONSE = S.obj({
    x: S.int
  }).desc('okay response has just one field: "x"')

  async computeResponse () {
    let resp = this.req.body.respText
    if (resp && resp[0] === '{') {
      resp = JSON.parse(resp)
    }
    const code = this.req.body.code
    if (code < 300) {
      throw new RequestDone(resp, code)
    } else {
      throw new RequestError(resp.message, resp, code)
    }
  }
}

class OneOptionalReturnValueAPI extends SimpleAPI {
  static NAME = 'Verify return fields present (one optional)'
  static PATH = '/oneOptionalReturnField'
  static QS = { n: S.int }
  static RESPONSE = {
    a: S.int,
    b: S.int,
    c: S.int.optional()
  }

  async computeResponse () {
    const resp = {}
    if (this.req.query.n >= 1) {
      resp.a = 1
      if (this.req.query.n >= 2) {
        resp.b = 2
        if (this.req.query.n >= 3) {
          resp.c = 3
        }
        if (this.req.query.n >= 4) {
          resp.d = 4
        }
      }
    }
    return resp
  }
}

class MissingNoReturnValueAPI extends OneOptionalReturnValueAPI {
  static NAME = 'Verify return fields all present'
  static PATH = '/noMissingReturnField'
  static RESPONSE = {
    a: S.int,
    b: S.int,
    c: S.int
  }
}

class DefaultValueAPI extends SimpleAPI {
  static PATH = '/defaultValue'
  static BODY = { v: S.int.default(5) }
  static RESPONSE = { v: S.int }
  async computeResponse () {
    return { v: this.req.body.v }
  }
}

class RequestValidationAPI extends SimpleAPI {
  static PATH = '/requestValidation/:aString'
  static HEADERS = {
    'x-header': S.str.min(4)
  }

  static QS = {
    param: S.str.enum('1', '2', '3')
  }

  static PATH_PARAMS = {
    aString: S.str.pattern(/[a-z]/)
  }

  static BODY = {
    value: S.str,
    anotherValue: S.int.default(2)
  }

  static RESPONSE = {
    response: S.str
  }

  async helperMethod (req) {
    return {
      response: 'yes'
    }
  }

  async computeResponse (req) {
    return this.helperMethod()
  }
}

class ReturnViaExceptionAPI extends SimpleAPI {
  static PATH = '/returnViaException'
  static BODY = {
    exc: S.obj({
      code: S.int.optional(),
      data: S.obj({
        x: S.int
      }).optional(),
      msg: S.str.optional()
    })
  }

  static ERRORS = {
    RedirectException
  }

  async computeResponse () {
    const e = this.req.body.exc
    if (e.code >= 400) {
      throw new RequestError(e.msg, e.data, e.code)
    } else if (e.code >= 300) {
      throw new RedirectException('fakeurl', e.code)
    } else {
      throw new RequestDone(e.data, e.code)
    }
  }
}

class NoRequiredAPI extends API {
  static PATH = '/noRequiredParam'
  static DESC = 'API with no required params and can optionally reply early.'
  static BODY = {
    optional1: S.str.optional(),
    optional2: S.str.optional()
  }

  static RESPONSE = { data: S.str.optional() }

  async computeResponse (req) {
    if (req.body.optional1 === 'invalid') {
      return { data: { abc: 12, aa: ['123'] } }
    }

    if (req.body.optional2 === 'return') {
      return { data: 'some data' }
    }
  }
}

class CallAPIAPI extends TxAPI {
  static NAME = 'Test callAPI with default params'
  static PATH = '/callAPIWithDefaults'
  static DESC = 'API for unit testing'
  static RESPONSE = RESPONSES.UNVALIDATED
  static HEADERS = S.obj({
    abc: S.str.optional()
  })

  static SDK_GROUP = 'user'
  async computeResponse () {
    return this.callAPI({
      url: 'http://nothing',
      compress: true
    })
  }
}

class ReturnBasicValueAPI extends TxAPI {
  static NAME = 'Return a custom (non-object) value'
  static PATH = '/getString'
  static DESC = 'API for unit testing'
  static HEADERS = { skipResponse: S.bool.optional() }
  static QS = { part1: S.str }
  static BODY = { part2: S.str }
  static RESPONSE = RESPONSES.UNVALIDATED
  static SDK_GROUP = null

  async computeResponse () {
    const pieces = [
      this.req.query.part1, this.req.body.part2,
      ReturnBasicValueAPI.valueFromSetup, this.req.headers['x-key']]
    return pieces.join(':')
  }

  static async setup () {
    ReturnBasicValueAPI.valueFromSetup = 'abc'
  }
}

class ReturnUndefinedAPI extends SimpleAPI {
  static PATH = '/returnUndefOrNull'
  static BODY = { retNull: S.bool }

  async computeResponse () {
    if (this.req.body.retNull) {
      return null
    }
    return undefined
  }
}

class SomeFakeWebAppAPI extends TxAPI {
  static NAME = 'api to serve a web app'
  static METHOD = 'GET'
  static DESC = 'pretends to serve a web app'
  static PATH = '/api/someWebApp'
  static SDK_GROUP = null
  static QS = {
    useCookie: S.bool.default(true),
    defineCustomCookie: S.bool,
    qparamsFlag: S.str,
    version: S.str.optional()
  }

  static RESPONSE = RESPONSES.UNVALIDATED

  async computeResponse (req) {
    const params = {
      schemeAndHost: 'http://localhost:3000'
    }
    if (req.query.qparamsFlag === 'include') {
      params.qparams = { y: 3 }
    } else if (req.query.qparamsFlag === 'empty') {
      params.qparams = {}
    }
    if (req.query.useCookie || req.query.defineCustomCookie) {
      params.cookie = { name: 'todea', domain: 'example.com' }
    }
    if (req.query.defineCustomCookie) {
      params.cookie.values = { x: 7 }
    }
    this.redirectToWebApp(params)
  }
}

class AuthentationAPI extends API {
  static PATH = '/auth'
  static DESC = 'Testing authentication errors'

  static BODY = {
    unauthorized: S.bool
  }

  static ERRORS = {
    UnauthorizedException,
    ForbiddenException
  }

  async computeResponse (req) {
    if (req.body.unauthorized) {
      throw new UnauthorizedException()
    } else {
      throw new ForbiddenException()
    }
  }
}

module.exports = {
  AuthentationAPI,
  CallAPIAPI,
  DefaultValueAPI,
  MissingNoReturnValueAPI,
  MultipleResponseSchemaAPI,
  NoOpAPI,
  NoRequiredAPI,
  OneOptionalReturnValueAPI,
  RequestValidationAPI,
  ReturnBasicValueAPI,
  ReturnUndefinedAPI,
  ReturnViaExceptionAPI,
  SomeFakeWebAppAPI
}
