const assert = require('assert')
const querystring = require('querystring')

const S = require('@pocketgems/schema')

const {
  BadRequestException,
  InvalidInputException,
  InternalFailureException,
  RedirectException,
  RequestDone,
  RequestError
} = require('./exception')
const RESPONSES = require('./response')

/**
   * Takes API level properties and generates JSON configurations to use
   * when registering the API with fastify.
   *
   * @param {API} api API to generate configurations for.
  */
function generateRegistrationOptions (api) {
  const ret = {
    attachValidation: true
  }
  return ret
}

/**
 * Public APIs (accessible without any user credentials) should be defined as
 * a subclass of @this.
 *
 * Override METHOD, PATH, QS, etc. to define the API. Swagger documentation
 * will be automatically generated for your API.
 *
 * Don't instantiate API instances yourself. Define the subclass, and pass it
 * to the service creation function from make-app.js and it will take care of
 * setting up routing for your API, etc.
 *
 * @public
 * @class
 */
class API {
  /**
   * The API's human-readable name.
   *
   * By default, this is computed by de-camel-casing the class name.
   * @public
   */
  static get NAME () {
    // the name is the de-camel-cased class name
    const clsName = this.name
    const ret = []
    let cur = []

    function wordDone () {
      if (cur.length) {
        ret.push(cur.join(''))
      }
    }

    let prevWasUpper = false
    let isAcronym = false
    const len = clsName.length - (clsName.endsWith('API') ? 3 : 0)
    for (let i = 0; i < len; i++) {
      const ch = clsName[i]
      const code = ch.charCodeAt(0)
      if (code >= 65 && code <= 90) {
        if (prevWasUpper) {
          // multiple uppercase in a row is an acronym; keep it together
          isAcronym = true
          cur.push(ch)
        } else {
          // previous word done
          wordDone()
          cur = [ch]
        }
        prevWasUpper = true
      } else {
        if (isAcronym) {
          // the last uppercase letter is part of the next word (not part of
          // the acronym)
          const lastUpper = cur.splice(cur.length - 1, 1)[0]
          wordDone()
          cur = [lastUpper]
          isAcronym = false
        }
        cur.push(ch)
        prevWasUpper = false
      }
    }
    wordDone()
    return ret.join(' ')
  }

  /**
   * Defines which SDK this API should be part of. Can be 'user', 'admin',
   * 'service' or null.
   * @public
   */
  static SDK_GROUP = null

  /**
   * Whether this API should have pagination parameters attached automatically.
   * When true, the API will have 'nextToken' field attached to the QS and
   * RESPONSE, and 'amount' field attached to QS automatically. To enable
   * pagination, RESPONSE must contain exactly one key with an array schema.
   */
  static ENABLE_PAGINATION = false

  /* istanbul ignore next */
  /**
   * The HTTP method used to request this API (e.g., GET, POST).
   * @public
   */
  static METHOD = 'POST'

  /* istanbul ignore next */
  /**
   * The HTTP path suffix used to request this API. For consistency, PATHs
   * should use lower camel-case as in the example mentioned; they should not
   * contain underscores.
   * @public
   * @abstract
   */
  static get PATH () {
    assert.fail('PATH must be overridden in ' + this.name)
    return undefined
  }

  /**
   * Returns the full HTTP path to this API.
   * @param {String} service The service this API belongs to.
   * @public
   */
  static getFullPath (service) {
    return `/${service}${this.PATH}`
  }

  /* istanbul ignore next */
  /**
   * A human-readable description of what this API does. It is only used when
   * automatically generating the Swagger documentation for the API.
   *
   * When used with the Swagger docs, newlines will be replaced with a single
   * space character. May use Markdown formatting.
   * @public
   * @abstract
   */
  static get DESC () {
    assert.fail('DESC must be overridden')
    return undefined
  }

  /** Returns DESC as a string ready for output as Markdown. */
  static getDescMarkdownString () {
    return this.DESC.trim().replace(/\n/g, ' ')
  }

  /**
   * Tag used to group APIs in the generated Swagger documentation. Set to null
   * to exclude it from the generated Swagger documentation.
   * @returns {String} a string tag
   * @public
   */
  static TAG = undefined

  /**
   * The Todea schema describing the HTTP headers this API handles, if any.
   * @public
   */
  static HEADERS = undefined

  /**
   * The Todea schema describing the path params this API handles, if any.
   */
  static PATH_PARAMS = undefined

  /**
   * The Todea schema describing the query string this API handles, if any.
   */
  static QS = undefined

  /**
   * The Todea schema describing the request body this API handles. Note that
   * GET requests should not have request bodies. Use HTTP POST requests if
   * request data size is too big to fit in the query string.
   */
  static BODY = undefined

  /**
   * The schema describes the response body. This is used to verify that the
   * implementation produces a correctly shaped output. It also speeds up JSON
   * output serialization by 10-20%.
   *
   * This can return one of two things:
   *   1) {@see ResponseSchema} - responses with HTTP 200 status codes
   *      will be validated against this schema. Non-200 responses can be
   *      anything. This is the typical return value.
   *   2) A subclass of {@see RequestDone}.
   *
   * The default is to not allow any output on HTTP 200 responses.
   */
  static RESPONSE = RESPONSES.NO_OUTPUT

  /**
   * Errors that may be returned from the API. Errors are subclasses
   * of RequestError.
   */
  static ERRORS = {}

  /**
   * Whether to log request body to Sentry when error.
   * For API with sensitive user data, this shouldn't set to true.
   */
  static LOG_REQUEST_BODY_ON_ERROR = false

  constructor (fastify, req, reply) {
    this.fastify = fastify
    this.log = fastify.log
    this.redis = fastify.redis
    this.req = req
    this.__reply = reply
    if (this.constructor.CORS_ORIGIN) {
      this.__setCORSHeaders(
        this.constructor.getCORSOrigin(), this.constructor.CORS_HEADERS)
    }
    reply.logRequestBodyOnError = this.constructor.LOG_REQUEST_BODY_ON_ERROR
    reply.apiName = this.constructor.name
  }

  /**
   * The hostname from which this API can be called in a browser. By default
   * this API cannot be called from a browser due to CORS policy (combined with
   * the fact that no web application runs on our API subdomain).
   */
  static CORS_ORIGIN = undefined

  /**
   * Returns the CORS origin to use. On localhost, a non-wildcard CORS_ORIGIN
   * is returned as the localhost web app domain instead.
   */
  static getCORSOrigin () {
    const origin = this.CORS_ORIGIN
    if (origin && origin !== '*' && origin !== 'null') {
      /* istanbul ignore else */
      if (process.env.NODE_ENV === 'localhost') {
        return 'http://localhost:3000'
      }
    }
    return origin
  }

  /**
   * The header(s) which are allowed in CORS requests.
   */
  static CORS_HEADERS = ['Content-Type']

  /**
   * Set headers to allow this API to be used in a browser from another origin.
   *
   * @param {string} origin the hostname from which this API can be called via
   *   CORS. On localhost, the origin is ignored and localhost is used instead.
   * @param {Array<string>} headers an optional list of headers to allow when
   *   this API is requested via CORS
   */
  __setCORSHeaders (origin, headers) {
    this.__reply.header('Access-Control-Allow-Origin', origin)
    if (headers && headers.length) {
      this.__reply.header('Access-Control-Allow-Headers', headers.join(', '))
    }
  }

  /**
   * Calls computeResponse() inside _callAndHandleRequestDone().
   * @protected
   * @returns {Object|String} the HTTP response body
   */
  async _computeResponse () {
    return this._callAndHandleRequestDone(this.computeResponse, this.req)
  }

  /**
   * Runs func(...args) and catches and handles RequestDone, if it is thrown.
   * @param {Function} func the function to run
   * @param  {...any} args the arguments to call func with
   * @returns the response data
   */
  async _callAndHandleRequestDone (func, ...args) {
    return this.constructor._callAndHandleRequestDone(
      this.__reply, async () => func.call(this, ...args))
  }

  /**
   * Runs func and catches and handles RequestDone, if it is thrown.
   * @param {fastify-reply} reply the reply object
   * @param {Function} func the function to run
   * @returns the response data
   */
  static async _callAndHandleRequestDone (reply, func) {
    try {
      return await func()
    } catch (e) {
      if (e instanceof RequestDone) {
        reply.code(e.httpCode)
        return e.respData
      } else {
        if (e.statusCode) {
          delete e.statusCode
          e.httpCode = 500
        }
        throw e
      }
    }
  }

  /* istanbul ignore next */
  /**
   * The API logic. This method is called after all inputs are validated
   * according to the schemas specified by the API definition.
   * @arg {Request} req the fastify request object being handled
   * @returns {Object|String} optional JSON-able object or string to send back
   *   as the HTTP response body
   * @abstract
   */
  async computeResponse (req) {
    assert.fail('API not implemented')
  }

  async callAPI ({
    method = 'POST', headers = {}, url, body, searchParams, compress
  }) {
    // Delay import got, 1. in case it's not used, or 2. we need to mock got
    const got = require('../got')

    headers = { ...headers } // copy so we can modify it
    this.addHeadersToForward(headers)
    const request = {
      headers,
      method,
      url,
      json: body,
      searchParams,
      throwHttpErrors: false,
      compress
    }
    const resp = got(request)
    const resolvedResp = await resp
    const ret = {
      code: resolvedResp.statusCode
    }
    ret.isOk = (ret.code === 200)
    const respBody = await resp.text()
    if (respBody) {
      try {
        ret.data = JSON.parse(respBody)
      } catch (e) {
        // istanbul ignore next
        throw new Error(`JSON.parse failed on ${respBody} with reason ${e}.`)
      }
    }
    return ret
  }

  /**
   * Adds (overwrites) headers with any header values from this request that
   * should be forwarded.
   * @param {Object} headers HTTP headers
   */
  addHeadersToForward (headers) {
    // forward permission headers, if present
    const headersToForward = this.constructor._HEADERS_TO_FORWARD
    for (let i = 0; i < headersToForward.length; i++) {
      const header = headersToForward[i]
      const headerValue = this.req.headers[header]
      if (headerValue !== undefined) {
        headers[header] = headerValue
      }
    }
    return headers
  }

  /**
   * Redirects to the URL hosting the specified web application.
   * @param {Object} [qparams] the query string parameters to launch with
   * @param {String} [service] the service the web application belongs to
   * @param {String} [version] the version of the web application to launch;
   *   can be overridden by query parameter "version" but otherwise defaults to
   *   the version of the service which served the web app
   * @param {Object} [cookieValues] values to pass in a cookie (good for
   *   sensitive values which should not be passed in in qparams, and for
   *   values which need to included with Todea HTTP requests the app makes)
   */
  redirectToWebApp ({
    schemeAndHost,
    path = '/',
    qparams = undefined,
    cookie
  }) {
    const qStr = qparams
      ? '?' + querystring.stringify(qparams)
      : ''

    const isLocalhost = process.env.NODE_ENV === 'localhost'
    /* istanbul ignore else */
    if (isLocalhost) {
      schemeAndHost = 'http://localhost:3000'
    }
    if (cookie) {
      const { values, domain, name } = cookie
      // istanbul ignore next
      const cookieDomain = isLocalhost ? '' : domain
      this.addHeadersToForward(values)
      this.__reply.setCookie(name, JSON.stringify(values ?? {}), {
        domain: cookieDomain,
        maxAge: 604800, // one week
        path: '/',
        secure: !isLocalhost,
        signed: true
      })
    }
    this.__reply.redirect(schemeAndHost + path + qStr)
  }

  static register (registrator) {
    registrator.registerAPI(this)
  }

  /**
   * Registers this API with the fastify app. This is called by internal
   * implementation details in make-app.js. In rare occasions, subclasses
   * may override this functionality to register the API with special
   * middleware or other custom options.
   *
   * If the API allows CORS requests, then an OPTIONS API with the same path
   * will also be registered to support browsers' CORS preflight requests.
   *
   * @param {*} app The fastify app to service this API from.
   * @param {String} service The service this API belongs to.
   * @package
   */
  static registerAPI (registrator) {
    const { app, service } = registrator
    if (this.setup) {
      app.register(this.setup)
    }
    const cls = this
    app.register(async (fastify) => {
      try {
        await cls.registerAPIWithFastify(fastify, cls.getFullPath(service))
      } catch (e) {
        if (e instanceof assert.AssertionError) {
          e.message = `${cls.name}: ${e.message}`
        }
        console.error(`failed to register API: ${cls.name}`)
        throw e
      }
    })

    if (this.CORS_ORIGIN) {
      // create an OPTIONS method API to support CORS preflight requests from
      // browsers
      const path = cls.getFullPath(service)
      const { params, querystring } = cls.swaggerSchema
      const schema = { hide: true, params, querystring }
      app.options(path, { schema }, async (req, reply) => {
        reply.header('Access-Control-Allow-Origin', this.getCORSOrigin())
        if (this.CORS_HEADERS) {
          reply.header('Access-Control-Allow-Headers',
            this.CORS_HEADERS.join(', '))
        }
        await reply.send()
      })
    }
  }

  /**
   * Removes the required marker from any top-level properties which have a
   * default value.
   * @param {TodeaSchema} schema a Todea schema
   */
  static __makeParamsWithDefaultValuesOptional (schema) {
    schema = schema.jsonSchema()
    assert.ok(schema.type === 'object', 'param schemas must be an S.obj')
    const requiredKeys = schema.required || []
    const requiredKeysSet = new Set(requiredKeys)
    assert.ok(requiredKeysSet.size === requiredKeys.length,
      `${this.name} required has a dupe; is description() in the wrong place?`)
    for (let i = requiredKeys.length - 1; i >= 0; i--) {
      const requiredKey = requiredKeys[i]
      const prop = schema.properties[requiredKey]
      if (Object.hasOwnProperty.call(prop, 'default')) {
        // a param with a default value is NOT required
        requiredKeys.splice(i, 1)
      }
    }
    return schema
  }

  /**
   * Returns the headers schema.
   * @protected
  */
  static _getHeaders () {
    let headers = this.HEADERS
    if (headers) {
      headers = headers.isTodeaSchema
        ? headers
        : S.obj(headers)
    }
    this._HEADERS_TO_FORWARD = (
      headers
        ? Object.keys(headers.objectSchemas)
        : [])
    return headers
  }

  /**
   * Returns the body schema.
   * @protected
  */
  static _getBody () {
    return this.BODY
  }

  /**
   * Return a response wrapped in a subclass of RequestDone.
   * @protected
   */
  static _getResponse () {
    const response = this.RESPONSE
    let ret
    if (response === RESPONSES.UNVALIDATED) {
      ret = undefined
    } else if (response.prototype instanceof RequestDone) {
      ret = response
    } else {
      ret = class extends RequestDone {
        static STATUS = 200
        static SCHEMA = response
      }
    }

    if (!this.ENABLE_PAGINATION) {
      return ret
    }

    if (!ret || !ret.SCHEMA) {
      throw new Error(
        `API ${this.name} has no response while pagination is enabled`)
    }

    if (ret.SCHEMA.nextToken) {
      throw new Error(
        `API ${this.name} must not use reserved key "nextToken" in response
        when pagination is enabled`)
    }

    const responseKeys = Object.keys(ret.SCHEMA)
    if (responseKeys.length !== 1) {
      throw new Error(
        `API ${this.name} must have one key in response since pagination is
        enabled`)
    }

    const schema = ret.SCHEMA[responseKeys[0]].jsonSchema()
    if (schema.type !== 'array') {
      throw new Error(
        `API ${this.name} must have one key that is an array schema when
        pagination is enabled`)
    }

    return class extends ret {
      static SCHEMA = {
        ...ret.SCHEMA,
        nextToken: S.str.optional()
          .desc(`A token used for paginating to the next "amount" of data. Pass
this value to the nextToken field as input to fetch the next page of data. When
this value is omitted, pagination has finished. Be sure to terminate pagination
else it will restart resulting in an infinite loop.`)
      }
    }
  }

  static get _QUERY_STRING () {
    if (!this.ENABLE_PAGINATION) {
      return this.QS
    }
    const qs = this.QS ?? {}
    if (qs.nextToken) {
      throw new Error('nextToken is reserved for ENABLE_PAGINATION flag')
    }
    if (qs.amount) {
      throw new Error('amount is reserved for ENABLE_PAGINATION flag')
    }
    return {
      ...qs,
      nextToken: S.str.optional()
        .desc(`A token used for paginating to the next "amount" of data. This
value is returned from the previous call to this paginated API. When this value
is omitted, pagination will start from the beginning.`),
      amount: S.int.min(1).max(1000).default(100)
        .desc(`Amount of data to fetch per page. The number of data returned
may be smaller than this amount in the last page, since there might not be
enough data to fill the last page.`)
    }
  }

  /**
   * Return all errors an API may return. Common base classes may use this
   * method to add common errors, so users of the common base class can specify
   * ERRORS without special considerations.
   * @protected
   */
  static _getErrors () {
    return {
      InternalFailureException,
      BadRequestException,
      InvalidInputException,
      ...this.ERRORS
    }
  }

  /**
   * Return a mapping from status code to Todea schemas.
   */
  static _getResponseSchemas () {
    const schemas = {}

    const response = this._getResponse()
    if (response) {
      schemas[response.STATUS] = response.schema
    }

    for (const error of Object.values(this._getErrors())) {
      schemas[error.STATUS] = error.respSchema
    }
    return schemas
  }

  /**
   * Return a default empty response matching the type specified in success
   * response schema.
   */
  static _getEmptySuccessResponse () {
    const response = this._getResponse()
    if (!response) {
      return ''
    }
    const jsonSchema = response.schema.jsonSchema()
    return {
      string: '',
      object: {},
      array: []
    }[jsonSchema.type]
  }

  /**
   * Handle an error thrown from API. Raise exceptions when errors that were
   * not explicitly listed in ERRORS is thrown in test environment. Re-throw
   * exceptions as 400 and 500 errors in production environment.
   * @param {Error} err A subclass of Error.
   * @param {Object} reply Reply object
   */
  static async _handleError (err, reply) {
    const errorName = err.constructor.name
    const isUntrackedError = err instanceof RequestError &&
      errorName !== RequestError.name &&
      !this._getErrors()[errorName]
    // istanbul ignore if
    if (isUntrackedError) {
      const errorMessage = `API ${this.name} emitted untracked error ` +
        `${err.constructor.name}`
      if (process.env.NODE_ENV !== 'prod') {
        throw new Error(errorMessage)
      }
      console.error(errorMessage)
      if (err.httpCode >= 500) {
        throw new InternalFailureException(err.message, err.data)
      } else if (err.httpCode >= 400) {
        throw new BadRequestException(err.message, err.data)
      }
    }
    if (err instanceof RedirectException) {
      reply.code(err.httpCode).redirect(err.url)
    } else {
      throw err
    }
  }

  static get swaggerSecurityConfig () {
    return []
  }

  static get swaggerSchema () {
    const wrapInSchema = (x) => {
      return x.isTodeaSchema ? x : S.obj(x)
    }
    let headers = this._getHeaders()
    if (headers) {
      // Make sure extra header fields are passed along
      headers = wrapInSchema(headers).jsonSchema()
      headers.additionalProperties = true // Hack to enable additional props
    }

    // istanbul ignore next
    const tags = [this.TAG || 'default']
    const schema = {
      summary: this.NAME,
      description: this.getDescMarkdownString(),
      tags,
      headers: headers,
      response: {}
    }
    if (this.TAG === null) {
      schema.hide = true
    }

    const pathParams = this.PATH_PARAMS
    if (pathParams) {
      schema.params = this.__makeParamsWithDefaultValuesOptional(
        wrapInSchema(pathParams))
    }
    const qs = this._QUERY_STRING
    if (qs) {
      schema.querystring = this.__makeParamsWithDefaultValuesOptional(
        wrapInSchema(qs))
    }
    const body = this._getBody()
    if (body) {
      schema.body = this.__makeParamsWithDefaultValuesOptional(
        wrapInSchema(body))
    }

    const respSchemas = this._getResponseSchemas()
    for (const statusCode in respSchemas) {
      const schemaForStatusCode = respSchemas[statusCode]
      const compiledSchema = schemaForStatusCode.getValidatorAndJSONSchema(
        `${schema.summary} HTTP ${statusCode} Response`)
      schema.response[statusCode] = compiledSchema.jsonSchema
    }

    schema.security = this.swaggerSecurityConfig
    return schema
  }

  /**
   * Registers the API with fastify's router.
   * @param {*} fastify The fastify library object from app.register().
   * @private
   */
  static async registerAPIWithFastify (fastify, fullPath) {
    assert.ok(this.DESC, 'DESC is missing')
    assert.ok(this.PATH && this.PATH.startsWith('/'),
      'API path must start with a "/"')
    assert.ok(this.PATH.indexOf('_') < 0,
      'API path should not have underscores') // use camel-case

    // convert our proprietary schema format to the fast-json-stringify format
    const respSchemas = this._getResponseSchemas()
    const responseValidators = {}
    for (const statusCode in respSchemas) {
      const schemaForStatusCode = respSchemas[statusCode]
      const compiledSchema = schemaForStatusCode.getValidatorAndJSONSchema(
        `${this.NAME} HTTP ${statusCode} Response`)
      responseValidators[statusCode] = compiledSchema.assertValid
    }

    const method = this.METHOD.toLowerCase()
    fastify[method](fullPath, {
      schema: this.swaggerSchema,
      ...generateRegistrationOptions(this)
    },
    async (req, reply) => {
      let ret
      try {
        if (req.validationError) {
          throw new InvalidInputException(req.validationError)
        }
        ret = await this._callAndHandleRequestDone(reply, async () => {
          const handler = new this(fastify, req, reply)
          return handler._computeResponse()
        })
      } catch (err) {
        await this._handleError(err, reply)
      }
      if (!reply.sent) {
        // convert an undefined return to an empty output (or fastify will hang
        // and wait for output forever)
        if (ret === undefined) {
          ret = this._getEmptySuccessResponse()
        }
        // verify the output we received is consistent with the schema
        const assertValidResponse = responseValidators[reply.statusCode]
        if (assertValidResponse) {
          assertValidResponse(ret)
        }
        return ret
      }
    })
  }
}

module.exports = {
  API,
  RESPONSES
}
