const assert = require('assert')

const S = require('@pocketgems/schema')

const RESPONSES = require('./response')

/**
 * @namespace Exceptions
 * @public
 */
/**
 * Thrown to shortcut request handling.
 *
 * {@link API} will catch this exception and send the HTTP response code
 * and (optional) data. This is useful to immediately stop request processing,
 * especially from deeply nested locations in the call stack where it would
 * be cumbersome to pass return information (especially errors) all the way
 * back up the call stack.
 *
 * Typically, users should throw {@link RequestError} for error responses or
 * @see RequestOkay for non-error responses (not @this).
 *
 * @arg {Number} httpCode The HTTP status code to respond with.
 * @arg {String|Object} [respData=''] The object (to JSON.stringify()) or
 *   string to send in the HTTP response body.
 * @package
 * @memberof Exceptions
 */
class __RequestDone extends Error {
  static STATUS = undefined
  static SCHEMA = RESPONSES.NO_OUTPUT

  static get schemaValidator () {
    const cacheKey = '_CACHED_SCHEMA_VALIDATOR'
    if (!Object.prototype.hasOwnProperty.call(this, cacheKey)) {
      this[cacheKey] = this.schema.compile(`data input to ${this.name}`)
    }
    return this[cacheKey]
  }

  /**
   * Gets a Todea Schema object.
   */
  static get schema () {
    let schema = this.SCHEMA
    if (!schema.isTodeaSchema) {
      schema = S.obj(schema)
    }
    return schema
  }

  /**
   * Create an exception.
   * @param {String} message An error message
   * @param {Object} data A JSON object containing additional data
   * @param {Integer} code An optional code to override exception's default
   *   STATUS
   */
  constructor (message, data = {}, code = undefined) {
    super(message)
    this.httpCode = code ?? this.constructor.STATUS
    assert(this.httpCode !== undefined, 'Status must be defined')
    assert(this.constructor.SCHEMA !== undefined, 'Schema must be defined')
    this.constructor.schemaValidator(data)
    this.data = data
  }
}

/**
 * Concrete class to indicate request is completed ok.
 */
class RequestDone extends __RequestDone {
  static STATUS = 200
  static SCHEMA = S.obj().optional()

  /**
   * Return data to return to caller.
   */
  get respData () {
    return this.data
  }

  /**
   * Create a success response. Status must be smaller than 400.
   * @param {Object} data Data to return to caller
   * @param {Integer} code A status to override default status.
   */
  constructor (data, code = undefined) {
    super(undefined, data, code)
    assert(this.httpCode < 300, 'Status code must be less than 300')
  }
}

/**
 * Thrown to shortcut request handling and return an HTTP success code (200).
 *
 * @arg {String|Object} [respData=''] The object (to JSON.stringify()) or
 *   string to send in the HTTP response body.
 * @public
 * @memberof Exceptions
 * @see RequestDone
 */
class RequestOkay extends RequestDone {
  static STATUS = 200
}

/**
 * Thrown to shortcut request handling and return an HTTP error.
 *
 * @arg {String} message The human-readable error message to send back in the
 *   JSON response data (in the "error" key).
 * @arg {Object} [data={}] Optional additional JSON data to send back
 *   in the error response body.
 * @arg {Number} [code=400] The HTTP status code to respond with; defaults
 *   to STATUS
 * @public
 * @memberof Exceptions
 * @see RequestDone
 */
class RequestError extends __RequestDone {
  static SCHEMA = S.obj()

  constructor (message, data = {}, code = undefined) {
    super(message, data, code)
    assert(this.httpCode >= 300, 'Status code must be at least 300')
  }

  /**
   * Schema to use on returned data
   */
  static get respSchema () {
    return S.obj({
      code: S.str,
      message: S.str.optional(),
      data: S.obj() // Data is validated in constructor, don't validate again.
    })
  }

  /**
   * Schema to use in SDKs
   */
  static get c2jSchema () {
    return S.obj({
      message: S.str.optional().title('ErrorMessage')
    })
  }

  /**
   * Data to return to the caller
   */
  get respData () {
    return {
      code: this.constructor.name,
      message: this.message,
      data: this.data
    }
  }
}

/**
 * Thrown when a redirect is required. RedirectException is a subclass of
 * RequestError, because AWS SDKs don't support more than one success
 * responses, and they are using exceptions to handle redirects already.
 */
class RedirectException extends RequestError {
  static STATUS = 302
  static SCHEMA = S.str.max(0)

  constructor (url, code) {
    super('', '', code)
    assert(this.httpCode < 400, 'Status code must be less than 400')
    assert(typeof url === 'string' && url.length)
    this.url = url
  }
}

/**
 * Thrown when a error is induced by client.
 */
class BadRequestException extends RequestError {
  static STATUS = 400
}

/**
 * Wraps Request Validation failures into
 * a RequestError object for processing.
 */
class InvalidInputException extends BadRequestException {
  static STATUS = 400
  static __ERROR_PREFIX = {
    headers: 'Header Validation Failure',
    body: 'Body Validation Failure',
    querystring: 'Query Validation Failure',
    params: 'Path Validation Failure'
  }

  constructor (schemaError) {
    const prefixMap = InvalidInputException.__ERROR_PREFIX
    const prefix = prefixMap[schemaError.validationContext] ??
      'Unknown Validation Failure'
    super(`${prefix}: ${schemaError.message}`)
    this.name = this.constructor.name
    // istanbul ignore else
    if (process.env.NODE_ENV !== 'prod' && schemaError.validation) {
      for (const err of schemaError.validation) {
        console.log(JSON.stringify(err))
      }
    }
  }
}

/**
 * Thrown when a client is not authorized to access the requested resource. For
 * example, user is trying to log in using invalid credentials.
 */
class UnauthorizedException extends RequestError {
  static STATUS = 401

  constructor (message = 'access denied') {
    super(message)
  }
}

/**
 * Thrown when an authenticated client does not have enough privilege to access
 * the requested resource. For example, a user tries to change other user's
 * data.
 */
class ForbiddenException extends RequestError {
  static STATUS = 403

  constructor (message = 'access denied') {
    super(message)
  }
}

/**
 * Thrown when the requested resource is not found, or should be hidden.
 */
class NotFoundException extends RequestError {
  static STATUS = 404

  constructor () {
    super('Not found')
  }
}

/**
 * Thrown when an error is induced by a server bug.
 */
class InternalFailureException extends RequestError {
  static STATUS = 500
}

/**
 * Thrown when server is temporarily unable to serve the request, due to
 * internal timeouts or service outage.
 */
class ServiceUnavailableException extends RequestError {
  static STATUS = 503
}

module.exports = {
  // Base exceptions
  RequestError,
  RequestDone,

  // Success
  RequestOkay,

  // Redirect
  RedirectException,

  // Error
  BadRequestException,
  InvalidInputException,
  ForbiddenException,
  InternalFailureException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
}
