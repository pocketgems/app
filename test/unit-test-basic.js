const { AssertionError } = require('assert')
const querystring = require('querystring')

const { API, EXCEPTIONS: { BadRequestException } } = require('..')

const { BaseAppTest, mockGot, runTests } = require('./base-test')

const mockedGot = mockGot()

function getURI (path) {
  return `/unittest${path}`
}

async function checkAPIRegisterWithErr (cls, errMsgOrError, moreOptions) {
  let expError
  if (typeof errMsgOrError === 'string') {
    // caller expects an AssertionError; just include the options they gave us
    moreOptions = moreOptions || { operator: 'fail' }
    expError = new AssertionError({
      message: `${cls.name}: ${errMsgOrError}`,
      ...moreOptions
    })
  } else {
    // caller gave us the error they expect
    expError = errMsgOrError
  }

  const fakeApp = {
    register: (apiRegistrationAsyncFunc) => {
      fakeApp.promise = apiRegistrationAsyncFunc('fake fastify test object')
    }
  }

  const fakeRegistrator = {
    registerAPI: (api) => api.registerAPI(fakeRegistrator),
    app: fakeApp,
    serviceName: 'badlydefinedservice'
  }

  await cls.register(fakeRegistrator)
  expect(async () => { await fakeApp.promise }).rejects.toEqual(expError)
}

async function checkRedirToWebApp (fastify, apiPath, app, headersToFwd = {}) {
  async function check (qparamsFlag, defineCustomCookie, version = '', useCookie = true) {
    const req = fastify.get(apiPath)
      .query({
        qparamsFlag,
        defineCustomCookie,
        useCookie,
        ...(version ? { version } : {})
      })
    for (const [k, v] of Object.entries(headersToFwd)) {
      req.set(k, v)
    }
    const resp = await req
    expect(resp.status).toBe(302)
    expect(resp.text).toBe('')
    const headers = resp.headers
    const redirLoc = headers.location
    const [url, qs] = redirLoc.split('?')
    expect(url).toBe('http://localhost:3000/')
    const qparams = querystring.parse(qs)
    const expQParams = (qparamsFlag === 'include') ? { y: '3' } : {}
    expect(qparams).toEqual(expQParams)
    if (useCookie || defineCustomCookie) {
      const cookies = headers['set-cookie']
      expect(cookies.length).toBe(1)
      expect(cookies[0]).toMatch(/todea=.*; Max-Age=604800; Path=\//)
      const data = cookies[0].split(';')[0]
      expect(data.substring(0, 6)).toBe('todea=')
      const decodedDataAndSig = decodeURIComponent(data.substring(6))
      const sigStartIdx = decodedDataAndSig.lastIndexOf('.')
      const decodedData = decodedDataAndSig.substring(0, sigStartIdx)
      console.log(decodedData)
      const parsedData = JSON.parse(decodedData)
      expect(parsedData).toEqual({
        ...(defineCustomCookie ? { x: 7 } : {}),
        ...headersToFwd
      })
    }
  }
  await check('include', false)
  await check('include', false, undefined, false)
  await check('empty', true)
  await check('omit', true)
  await check('include', true, 'another_version')
}

class BasicTest extends BaseAppTest {
  async testJSONContentParser () {
    // Empty body should be ignored even if content type is application/json
    mockedGot.mockResp('')
    await this.app.post(getURI('/callAPIWithDefaults'))
      .set({
        'content-type': 'application/json'
      })
      .expect(200)
    mockedGot.mockReset()
  }

  async testAuthentication () {
    await this.app.post(getURI('/auth')).send({ unauthorized: true }).expect(401)
    await this.app.post(getURI('/auth')).send({ unauthorized: false }).expect(403)
  }

  async testParsingJsonResp () {
    mockedGot.mockResp('{}')
    await this.app.post(getURI('/callAPIWithDefaults'))
      .set({
        'content-type': 'application/json',
        abc: '123'
      })
      .expect(200)
    expect(mockedGot).toHaveBeenCalledWith({
      method: 'POST',
      headers: {
        abc: '123'
      },
      json: undefined,
      searchParams: undefined,
      url: 'http://nothing',
      throwHttpErrors: false,
      compress: true
    })
    mockedGot.mockReset()
  }

  async testAssertInAPIRegistration () {
    class MissingPathAPI extends API {}
    class BadPathStartAPI extends API {
      static PATH = 'wrong/starting/character'
    }
    class BadPathAPI extends API {
      static PATH = '/underscores_not_ok'
    }
    class MissingDescAPI extends API {
      static PATH = '/'
    }
    class AlsoMissingDescAPI extends API {
      static PATH = '/'
      static DESC = undefined
    }
    class EvenMoreMissingDescAPI extends API {
      static PATH = '/'
      static DESC = ''
    }

    await checkAPIRegisterWithErr(MissingPathAPI, 'PATH must be overridden')
    await checkAPIRegisterWithErr(BadPathStartAPI, 'API path must start with a "/"')
    await checkAPIRegisterWithErr(BadPathAPI, 'API path should not have underscores')
    await checkAPIRegisterWithErr(MissingDescAPI, 'DESC must be overridden')
    await checkAPIRegisterWithErr(AlsoMissingDescAPI, 'DESC is missing', {
      operator: '==', expected: true
    })
    await checkAPIRegisterWithErr(EvenMoreMissingDescAPI, 'DESC is missing', {
      operator: '==', expected: true, actual: ''
    })
  }

  async testExceptionInAPIRegisteration () {
    class SomeAPI extends API {
      static PATH = '/'
      static async registerAPIWithFastify () {
        throw new Error('some error')
      }
    }
    await checkAPIRegisterWithErr(SomeAPI, new Error('some error'))
  }

  async testForwardingHeaders () {
    mockedGot.mockResp('{}')
    await this.app.post(getURI('/callAPIWithDefaults'))
      .set({
        'content-type': 'application/json'
      })
      .expect(200)
    mockedGot.mockReset()
  }

  async testNoOpAPI () {
    const result = await this.app.post(getURI('/noOp')).expect(200)
    expect(result.text).toBe('')
  }

  async testCallAPIWithDefaults () {
    // test default params for callAPI()
    mockedGot.mockResp('')
    const expResp = {
      code: 200,
      isOk: true
    }
    const result = await this.app.post(getURI('/callAPIWithDefaults'))
      .expect(200)
    expect(result.body).toEqual(expResp)

    expect(mockedGot).toHaveBeenCalledWith({
      method: 'POST',
      headers: {},
      json: undefined,
      searchParams: undefined,
      url: 'http://nothing',
      throwHttpErrors: false,
      compress: true
    })
    mockedGot.mockReset()
  }

  async testCallAPIWithTrailingSlashWithDefaults () {
    // test ignore trailing slash in fastify app option
    mockedGot.mockResp('')
    const expResp = {
      code: 200,
      isOk: true
    }
    const result = await this.app.post(getURI('/callAPIWithDefaults/'))
      .expect(200)
    expect(result.body).toEqual(expResp)

    expect(mockedGot).toHaveBeenCalledWith({
      method: 'POST',
      headers: {},
      json: undefined,
      searchParams: undefined,
      url: 'http://nothing',
      throwHttpErrors: false,
      compress: true
    })
    mockedGot.mockReset()
  }

  async testCheckAPINaming () {
    class Test1 extends API {}
    expect(Test1.NAME).toBe('Test1')
    class TestMultipleWords extends API {}
    expect(TestMultipleWords.NAME).toBe('Test Multiple Words')
    class TestAcronymCOOLKidsAPI extends API {}
    expect(TestAcronymCOOLKidsAPI.NAME).toBe('Test Acronym COOL Kids')
    class ALLBIG extends API {}
    expect(ALLBIG.NAME).toBe('ALLBIG')
  }

  async testSetup () {
    const result = await this.app.post(getURI('/getString'))
      .query({ part1: 'p1' })
      .set('x-key', '123')
      .set('Content-Type', 'application/json')
      .send('{"part2": "p2"}')
      .expect(200)
    expect(result.text).toBe('p1:p2:abc:123')
  }

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

  async testReturnViaException () {
    const app = this.app
    async function check (exc, expCode, expMessage, expData) {
      const result = await app.post(getURI('/returnViaException'))
        .send({ exc })
        .set('Content-Type', 'application/json')
        .expect(expCode)
      if (expCode < 300) {
        expect(result.body).toEqual(expData)
      } else if (expCode < 400) {
        expect(result.text).toEqual('')
      } else {
        expect(result.body.message).toBe(expMessage)
        expect(result.body.data).toEqual(expData)
      }
      if (expMessage === undefined && expData === undefined) {
        expect(result.text).toBe('')
      }
    }
    for (let code = 200; code < 600; code += 100) {
      await check({ code, data: { x: 5 } }, code, '', { x: 5 })
      if (code >= 400) {
        await check({ code, msg: 'hi' }, code, 'hi', {})
        await check({ code, msg: 'hi', data: { x: 5 } }, code,
          'hi', { x: 5 })
      }
    }
    await check({ code: 200 }, 200, undefined, {})
    await check({ data: { x: 5 } }, 200, undefined, { x: 5 })
    await check({ code: 400, msg: 'ouch' }, 400, 'ouch', {})
  }

  async testRequiredReturnValues () {
    const app = this.app
    async function check (path, n, isOkay) {
      const expCode = isOkay ? 200 : 500
      const result = await app.post(getURI(path))
        .query({ n })
        .expect(expCode)
      const expBody = {}
      if (expCode === 200) {
        if (n >= 1) expBody.a = 1
        if (n >= 2) expBody.b = 2
        if (n >= 3) expBody.c = 3
        expect(result.body).toEqual(expBody)
      }
    }
    for (let n = 0; n <= 4; n++) {
      await check('/oneOptionalReturnField', n, [2, 3].includes(n))
      await check('/noMissingReturnField', n, n === 3)
    }
  }

  async testRequestError () {
    const errNoMsg = new BadRequestException()
    expect(errNoMsg.httpCode).toBe(400)
    expect(errNoMsg.respData.message).toEqual('')
    const errWithMsg = new BadRequestException('hi')
    expect(errWithMsg.httpCode).toBe(400)
    expect(errWithMsg.respData.message).toEqual('hi')
  }

  async testFailAdditionalProps () {
    await this.app.post(getURI('/multiSchema'))
      .set('Content-Type', 'application/json')
      .send({ additionalProp: 123 })
      .expect(400)
  }

  async testMultiRespAPI () {
    const app = this.app
    async function check (code, body, expRet, expRetCode) {
      if (Object.getPrototypeOf(body).constructor === Object) {
        body = JSON.stringify(body)
      }
      if (body && expRet === undefined) {
        expRet = body
      } else if (expRet) {
        if (Object.getPrototypeOf(expRet).constructor === Object) {
          expRet = JSON.stringify(expRet)
        }
      }
      const expCode = expRetCode || code
      const result = await app.post(getURI('/multiSchema'))
        .set('Content-Type', 'application/json')
        .send({ code: code, respText: body })
        .expect(expCode)
      if (expRet !== null) {
        if (expCode < 400) {
          expect(result.text).toBe(expRet)
        } else {
          expect(result.body.data).toEqual(JSON.parse(expRet))
        }
      } else {
        // expRet===null means we expect some fastify error message back
        expect(result.body.code.length).toBeGreaterThan(0)
      }
    }

    // check that responses with the exact right content are validated
    const exp200Resp = { x: 5 }
    await check(200, exp200Resp)
    const exp400Resp = { error: 'just testing', y: true }
    await check(400, exp400Resp)

    // extra fields in the reply
    await check(200, { ...exp200Resp, y: true, evenMore: [1, 2] }, null, 500)
    await check(400, { ...exp400Resp, dd: 'error' }, null, 400)

    // incompatible types cause a problem
    await check(200, { x: 'not a number' }, null, 500)

    // missing required fields causes problems
    await check(200, {}, null, 500)
    await check(200, { xx: 'wrong name' }, null, 500)
    await check(200, ' {"x": 5}', null, 500) // obj not str required
    await check(400, { error: 'still need y' }, null, 400)
    await check(400, { y: true }, null, 400)

    // must return object, not string or other types, when schema specified
    await check(200, 'hi', null, 500)
    await check(200, 'x=5', null, 500)
  }

  async testNoRequiredParam () {
    const app = this.app
    async function check (data, expectedResult, code = 200) {
      const result = await app.post(getURI('/noRequiredParam'))
        .set('Content-Type', 'application/json')
        .send(data)
        .expect(code)
      if (code === 200) {
        expect(result.body.data).toBe(expectedResult)
      }
    }

    // Default reply works
    await check({}, undefined)
    // Sending reply by return
    await check({ optional2: 'return' }, 'some data')
    // Invalid reply are caught
    await check({ optional1: 'invalid' }, undefined, 500)
  }

  async testDefaultValueAPI () {
    const resultOverrideDefault = await this.app.post(getURI('/defaultValue'))
      .set('Content-Type', 'application/json')
      .send({ v: 10 })
      .expect(200)
    expect(resultOverrideDefault.body).toEqual({ v: 10 })

    const resultUseDefault = await this.app.post(getURI('/defaultValue'))
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200)
    expect(resultUseDefault.body).toEqual({ v: 5 })
  }

  async testAPIResponseTime () {
    function checkHeader (response) {
      const regexExp = '^[0-9]+\\.[0-9]{3}$'
      const regexEndWithMS = new RegExp(regexExp)
      expect(response.header['x-latency-ms'].toString())
        .toMatch(regexEndWithMS)
    }
    const defaultResp = await this.app.post(getURI('/defaultValue'))
      .set('Content-Type', 'application/json')
      .send({ v: 10 })
      .expect(200)
    checkHeader(defaultResp)

    // Testing return with different code have response-time
    for (const manualCode of [200, 300, 401]) {
      const resp = await this.app.post(getURI('/setCode'))
        .set('Content-Type', 'application/json')
        .send({ manualCode })
        .expect(manualCode)
      checkHeader(resp)
    }
    // Test return with exception have response-time
    const resp = await this.app.post(getURI('/returnViaException'))
      .send({ code: 400, msg: 'ouch' })
      .set('Content-Type', 'application/json')
      .expect(400)
    checkHeader(resp)
  }

  async testReturnNullAndUndefined () {
    const app = this.app
    async function check (retNull) {
      const resp = await app.post(getURI('/returnUndefOrNull'))
        .set('Content-Type', 'application/json')
        .send({ retNull })
        .expect(200)
      // Returning null gets JSON.stringified to "null"
      // Returning undefined results in an empty JSON response body
      expect(resp.text).toBe(retNull ? 'null' : '')
    }
    await check(true)
    await check(false)
  }

  async testRedirToWebappWithHeaderForwarding () {
    await checkRedirToWebApp(this.app, getURI('/api/someWebApp'), 'fake')
  }
}

/**
 * Test out schema validation failures
 */
class RequestValidationTest extends BaseAppTest {
  makeRequest ({
    body = {
      value: 's'
    },
    header = '1234',
    pathParam = 's',
    queryParam = '1'
  } = {}) {
    return this.app
      .post(getURI(`/requestValidation/${pathParam}`))
      .set('x-header', header)
      .query({ param: queryParam })
      .send(body)
  }

  async testNoError () {
    await this.makeRequest({})
      .expect(200)
  }

  /**
   * Verify all schema errors for a given request part are returned
   */
  async testMultipleBodyErrors () {
    await this.makeRequest(
      {
        body: {
          value: ['not', 'a', 'string'],
          anotherValue: 'not a number'
        }
      })
      .expect(400, {
        code: 'InvalidInputException',
        message: 'Body Validation Failure: body/value must be string, body/anotherValue must be integer',
        data: {}
      })
  }

  async testBodyValidation () {
    await this.makeRequest(
      {
        body: {
          value: ['not', 'a', 'string']
        }
      })
      .expect(400, {
        code: 'InvalidInputException',
        message: 'Body Validation Failure: body/value must be string',
        data: {}
      })
  }

  async testHeaderValidation () {
    await this.makeRequest({ header: '12' })
      .expect(400, {
        code: 'InvalidInputException',
        message: 'Header Validation Failure: headers/x-header must NOT have fewer than 4 characters',
        data: {}
      })
  }

  async testPathParamValidation () {
    await this.makeRequest({ pathParam: 'ASTRING' })
      .expect(400, {
        code: 'InvalidInputException',
        message: 'Path Validation Failure: params/aString must match pattern "^[a-z]$"',
        data: {}
      })
  }

  async testQueryParamValidation () {
    await this.makeRequest({ queryParam: 'ASTRING' })
      .expect(400, {
        code: 'InvalidInputException',
        message: 'Query Validation Failure: querystring/param must be equal to one of the allowed values',
        data: {}
      })
  }

  async testUnknownValidationError () {
    const { RequestValidationAPI } = require('../examples/basic')
    const { EXCEPTIONS: { InvalidInputException } } = require('..')
    const err = new InvalidInputException({ message: 'hai' })
    jest.spyOn(RequestValidationAPI.prototype, 'helperMethod')
      .mockRejectedValue(err)

    await this.makeRequest({})
      .expect(400, {
        code: 'InvalidInputException',
        message: 'Unknown Validation Failure: hai',
        data: {}
      })
  }

  async testHealthCheck () {
    await this.app.get('/').expect(200)
  }
}

runTests(BasicTest, RequestValidationTest)
