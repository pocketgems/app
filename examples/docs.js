const assert = require('assert')

const S = require('@pocketgems/schema')

const {
  API,
  EXCEPTIONS,
  RESPONSES,
  TxAPI
} = require('..')

const {
  BadRequestException,
  InternalFailureException,
  NotFoundException,
  RequestDone,
  RequestOkay,
  RedirectException,
  RequestError
} = EXCEPTIONS

class NonStandardResponse extends RequestDone {
  static STATUS = 201
}

class NonStandardReturnCodeAPI extends API {
  static PATH = '/nonStandardReturnCode'
  static DESC = 'API with non-standard 2xx return code.'
  static RESPONSE = NonStandardResponse

  async computeResponse (req) {
    throw new NonStandardResponse()
  }
}

class DupNotFoundException extends NotFoundException {}

class DupErrorCodeAPI extends API {
  static PATH = '/dupErrorCode'
  static DESC = 'API with multiple error with the same status code.'
  static BODY = {
    exception: S.str
  }

  static ERRORS = {
    NotFoundException,
    DupNotFoundException
  }

  async computeResponse (req) {
    if (req.body.exception === 'notfound') {
      throw new NotFoundException() // default error message "Not found"
    } else {
      throw new DupNotFoundException('custom message')
    }
  }
}

class SetCodeAPI extends TxAPI {
  static PATH = '/setCode'
  static DESC = 'API that set status code manually.'
  static BODY = {
    manualCode: S.int
  }

  async computeResponse (req) {
    this.__reply.code(req.body.manualCode)
  }
}

// APIs for the README
class WhatTimeIsItAPI extends API {
  static PATH = '/whatTimeIsIt'
  static DESC = 'Returns the current date string'
  static RESPONSE = S.obj().prop('epoch', S.double)
  async computeResponse () {
    return { epoch: new Date().getTime() / 1000 }
  }
}

class AddNumbersAPI extends API {
  static PATH = '/add'
  static DESC = 'returns the sum of a bunch of numbers'
  // this API only takes numbers and arrays of numbers, but Todea schema
  // can describe arbitrary JSON data including complex objects
  static BODY = {
    num1: S.double.desc('some number'),
    num2: S.double.default(10)
      .desc('another number; if omitted, a default value will be used'),
    more: S.arr(S.double).optional()
      .desc('optional array of more numbers to add')
  }

  static RESPONSE = RESPONSES.UNVALIDATED

  // Input data is validated prior to computeResponse() being called. If any
  // input is invalid, then an HTTP 400 response is returned. On test servers,
  // the response body will also include a description of the error.
  async computeResponse () {
    const numbers = (this.req.body.more || []).concat([
      this.req.body.num1, this.req.body.num2])
    let sum = 0
    for (let i = 0; i < numbers.length; i++) {
      sum += numbers[i]
    }
    return sum
  }
}

class ReplyWithValidatedObjectAPI extends API {
  static PATH = '/getJSON'
  static DESC = 'returns some JSON data'

  // response example start
  // The RESPONSE getter defines which properties should be present in the
  // returned data. Only the defined properties are validated and sent. Any
  // extra properties would result in a 500 response.
  static RESPONSE = {
    canHaveArbitraryJSONContent: S.bool,
    hello: S.str,
    address: S.obj({
      apartmentNumber: S.int.optional(),
      houseNumber: S.int,
      street: S.str
    }),
    walkScore: S.double
  }
  // response example end

  // when an object is returned, it is automatically converted to a JSON string
  // and the HTTP response's Content-Type header is set to application/json
  async computeResponse () {
    return {
      canHaveArbitraryJSONContent: true,
      hello: 'world',
      address: {
        houseNumber: 123,
        street: 'Bush St'
      },
      walkScore: 3.14
    }
  }
}

class ReplyWithDocumentedValidatedObjectAPI extends API {
  static PATH = '/getDocumentedJSON'
  static DESC = 'returns some documented JSON data'

  // another resp example start
  static RESPONSE = S.obj({
    dragons: S.arr(S.str.desc('Dragon ID')).desc('Your dragons'),
    guineaPigs: S.arr(S.str.desc('name').desc('Your dragons')),
    optionalValue: S.int.desc('describe optional fields like this')
      .optional()
  }).desc('the mythic creatures you have collected')
  // another resp example end

  async computeResponse () {
    return {
      dragons: ['d1', 'd2'],
      guineaPigs: ['Peggy', 'Angelica', 'Eliza'],
      optionalValue: 3
    }
  }
}

class ThrowToReplyAPI extends API {
  static PATH = '/throwToReturn'
  static DESC = 'returns some data by throwing'
  static QS = { shouldError: S.bool }
  static RESPONSE = RESPONSES.UNVALIDATED

  async computeResponse () {
    this.help1()
  }

  help1 () { this.help2() }

  help2 () {
    // imagine we're deep in a complicated call stack but discover we know the
    // response we need to send... instead of painstakingly passing it back up
    // the call stack, we should use an exception to simply send the output
    // from here
    if (this.req.query.shouldError) {
      throw new BadRequestException('run away!')
    } else {
      throw new RequestOkay({ hello: 'world' })
    }
  }
}

class ThrowFromConstructorToReplyAPI extends API {
  static PATH = '/throwToReturnFromConstructor'
  static DESC = 'returns some data by throwing'
  static BODY = { shouldError: S.bool }
  static RESPONSE = { msg: S.str }

  constructor (fastify, req, reply) {
    super(fastify, req, reply)
    if (req.body.shouldError) {
      throw new BadRequestException('threw in constructor')
    }
    throw new RequestOkay({ msg: 'threw an okay in constructor' })
  }
}

class PostComputeResponseWithThrowAPI extends TxAPI {
  static PATH = '/preCommit'
  static DESC = 'tests preCommit()'
  static SDK_GROUP = null
  static QS = {
    shouldThrow: S.str,
    shouldPreCommitThrow: S.str,
    code: S.int.optional()
  }

  static RESPONSE = RESPONSES.UNVALIDATED

  static ERRORS = {
    RedirectException
  }

  async computeResponse () {
    return this.makeResponse({}, false)
  }

  async preCommit (respData) {
    return this.makeResponse(respData, true)
  }

  async postCommit (respData) {
    respData.committed = true
    return respData
  }

  makeResponse (ret, isPreCommit) {
    const respTypeKey = isPreCommit ? 'shouldPreCommitThrow' : 'shouldThrow'
    const respType = this.req.query[respTypeKey]
    const respBodyKey = isPreCommit ? 'preCommit' : 'main'
    ret[respBodyKey] = true
    const code = this.req.query.code
    if (respType === 'RequestOkay' || respType === 'return') {
      if (respType === 'return') {
        return ret
      }
      throw new RequestOkay(ret)
    }

    if (respType === 'RequestDone') {
      if (code < 300) {
        throw new RequestDone(ret, code)
      } else {
        throw new RedirectException('fakeurl', code)
      }
    }
    if (respType === 'RequestError') {
      throw new RequestError(JSON.stringify(ret), undefined, code)
    }
    assert.fail('invalid respType')
  }
}

class NonStandardAddNumbersAPI extends API {
  static METHOD = 'PUT'
  static PATH = '/add/:num6/:num7'
  static DESC = 'returns the sum of a bunch of numbers'

  // we can send input as part of the query string (e.g., ?num=1&num2=...)
  // sensitive data (such as a password hash) should not be sent in the query
  // string as query strings are logged in request logs
  static QS = {
    num1: S.double.desc('some number'),
    num2: S.double.desc('another number')
  }

  // input can also be sent in the body (for POST and PUT requests); this is
  // preferred for large of complex data types like JSON objects
  static BODY = {
    num3: S.double.desc('yet another number'),
    num4: S.double.desc('a 4th number to add'),
    more: S.arr(S.double).optional()
      .desc('optional array of more numbers to add')
  }

  // headers may also be used to communicate inputs, but are not typically used
  // by APIs; they're primarily used for data sent on every request like user
  // credentials
  static HEADERS = {
    num5: S.double.desc('a fifth number to add')
  }

  // input data may also be communicated in the path itself
  static PATH_PARAMS = {
    num6: S.double,
    num7: S.double
  }

  static RESPONSE = RESPONSES.UNVALIDATED

  // Input data is validated prior to computeResponse() being called. If any
  // input is invalid, then an HTTP 400 response is returned. On test servers,
  // the response body will also include a description of the error.
  async computeResponse () {
    const numbers = (this.req.body.more || []).concat([
      this.req.query.num1, this.req.query.num2,
      this.req.body.num3, this.req.body.num4,
      this.req.headers.num5,
      this.req.params.num6, this.req.params.num7
    ])
    let sum = 0
    for (let i = 0; i < numbers.length; i++) {
      sum += numbers[i]
    }
    // respond with an XML string instead of JSON
    return `<sum>${sum}</sum>`
  }

  // add a custom content-type parser that will be available to just this API
  // (to handle the custom data format sent to this API)
  static async registerAPIWithFastify (fastify, fullPath) {
    function parser (req, body, done) {
      if (!body.startsWith('wacky!')) {
        done(new InternalFailureException('invalid wacky format'))
      } else {
        try {
          const jsonStr = body.substring(6)
          done(null, JSON.parse(jsonStr))
        } catch (err) {
          err.statusCode = 400
          done(err, undefined)
        }
      }
    }
    fastify.addContentTypeParser(
      'wackyCustom_thing', { parseAs: 'string' }, parser)
    super.registerAPIWithFastify(fastify, fullPath)
  }
}

class ErrorPropagationAPI extends API {
  static NAME = 'Error propagation'
  static DESC = 'Throw error'
  static PATH = '/api/errorPropagation'
  static BODY = {
    throw: S.str
  }

  async computeResponse (req) {
    const err = new Error('XYZ')
    if (req.body.throw === 'httpCode') {
      err.httpCode = 456
    } else {
      err.statusCode = 465
    }
    throw err
  }
}

module.exports = {
  AddNumbersAPI,
  DupErrorCodeAPI,
  ErrorPropagationAPI,
  NonStandardAddNumbersAPI,
  PostComputeResponseWithThrowAPI,
  ReplyWithDocumentedValidatedObjectAPI,
  ReplyWithValidatedObjectAPI,
  ThrowFromConstructorToReplyAPI,
  ThrowToReplyAPI,
  WhatTimeIsItAPI,
  NonStandardReturnCodeAPI,
  SetCodeAPI
}
