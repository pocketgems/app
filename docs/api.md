# API Definition Library <!-- omit in toc -->
This library is used to define Todea APIs.

## Topics
- [Core Concepts](#core-concepts)
  - [Minimal API](#minimal-api)
  - [API Input Data](#api-input-data)
  - [API Output Data](#api-output-data)
  - [Short-circuit Response Processing](#short-circuit-response-processing)
    - [Returning Errors](#returning-errors)
    - [Custom Errors](#custom-errors)
    - [Dynamic Errors](#dynamic-errors)
    - [Return Success Response](#return-success-response)
    - [Custom Success Status](#custom-success-status)
  - [Database Transactions](#database-transactions)
    - [Pre and Post Commit Processing](#pre-and-post-commit-processing)
    - [Gotcha: Shared State](#gotcha-shared-state)
    - [Gotcha: Expensive Computation](#gotcha-expensive-computation)
  - [API Path](#api-path)
  - [Long API Descriptions](#long-api-descriptions)
  - [Swagger Interactive Documentation](#swagger-interactive-documentation)
  - [One-Time Setup](#one-time-setup)
  - [Asynchronous Processing](#asynchronous-processing)
  - [Cross Origin (CORS)](#cross-origin-cors)
- [Niche Concepts](#niche-concepts)
  - [Pagination](#pagination)
  - [Other API Input Data Options](#other-api-input-data-options)
  - [Non-app specific APIs](#non-app-specific-apis)
  - [Controlling API Visibility in SDKs](#controlling-api-visibility-in-sdks)
  - [Custom Middleware](#custom-middleware)
  - [Gotcha: Sharing Schemas](#gotcha-sharing-schemas)
  - [Gotcha: Unrelated API Parameters with the Same Name](#gotcha-unrelated-api-parameters-with-the-same-name)
  - [Gotcha: Response for APIs included in SDKs must be objects](#gotcha-response-for-apis-included-in-sdks-must-be-objects)
  - [Localhost Cross-Origin Resource Sharing (CORS)](#localhost-cross-origin-resource-sharing-cors)
- [Appendix](#appendix)

# Core Concepts

## Minimal API
Define a new API by subclassing `UnauthenticatedAPI` and implementing at
least these required members:

  * `PATH` - the HTTP path used to call the API (more on this
    [later](#api-path)). Should be camel-case (no underscores).
  * `DESC` - a human-readable description of what the API does
  * `RESPONSE` - describes the shape of the output JSON (more on this later)
  * `computeResponse()` - processes the request and returns the response
```javascript <!-- embed:./examples/docs.js:scope:WhatTimeIsItAPI -->
class WhatTimeIsItAPI extends API {
  static PATH = '/whatTimeIsIt'
  static DESC = 'Returns the current date string'
  static RESPONSE = S.obj().prop('epoch', S.double)
  async computeResponse () {
    return { epoch: new Date().getTime() / 1000 }
  }
}
```


## API Input Data
Todea APIs can receive input data from a JSON-formatted HTTP request body. API
input MUST ALWAYS be validated. To streamline this, API inputs must be
described using [Todea schema](https://github.com/pocketgems/schema) (`S`)
like this:
```javascript <!-- embed:./examples/docs.js:scope:AddNumbersAPI -->
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
```

Notice that inputs can be configured to use a default value if none is provided
(see `num2`). Inputs can also be configured to just have their value be
undefined if omitted with the `optional()` marker (see `more`).

The `BODY`, `PATH_PARAMS`, `HEADERS`, and `QS` properties all support a mapping of field names to Todea Schema objects. For advanced usages like specifying a default value or description, the mapping can be replaced with an Object schema `S.obj({})`. For example:
```javascript
static BODY = S.obj({ a: S.str })
```
is equivalent to
```javascript
static BODY = { a: S.str }
```

**Gotcha**: `desc()` should be called on the _type_ to describe a property.
```javascript
static BODY = S.obj({
  x: S.double.desc('describes x'),
  y: S.double
}).desc('describes BODY')
```

## API Output Data
Todea APIs can send output data in a JSON-formatted HTTP response body. To do
this, simply return an object from the `computeResponse()` method:
```javascript <!-- embed:./examples/docs.js:scope:class ReplyWithValidatedObjectAPI:when an object is returned -->
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
```

JSON response bodies must also be validated. The response schema documents the
expected output, as well as double-checks the correctness of output generated
by the API. Unexpected keys are considered as invalid. If you do not define an
output schema, then no output is permitted. Output validation can be performed
the same as input validation:
```javascript <!-- embed:./examples/docs.js:section:response example start:response example end -->
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
```

The response schema values can optionally be documented like this:
```javascript <!-- embed:./examples/docs.js:section:another resp example start:another resp example end -->
  static RESPONSE = S.obj({
    dragons: S.arr(S.str.desc('Dragon ID')).desc('Your dragons'),
    guineaPigs: S.arr(S.str.desc('name').desc('Your dragons')),
    optionalValue: S.int.desc('describe optional fields like this')
      .optional()
  }).desc('the mythic creatures you have collected')
```

If the API has no response body, then `RESPONSE` should be omitted.

## Short-circuit Response Processing
Complex APIs will have a `computeResponse()` which calls other functions. When
an error occurs deep in the call stack, it can be unwieldy and error-prone to
pass that error information back up the call stack simply to return that
information from `computeResponse()`. It can be useful to simply end request
processing at any point by throwing an exception which specifies the output.

```javascript <!-- embed:./examples/docs.js:scope:ThrowToReplyAPI -->
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
```

These may also be thrown from an API's constructor.

### Returning Errors
This library defines several exceptions classes, for example:
- InternalFailureException
- BadRequestException
- UnauthorizedException
- ...

These exceptions are exported in the `EXCEPTIONS` variable.
```javascript
const { EXCEPTIONS } = require('./api')
const { UnauthorizedException } = EXCEPTIONS
```

APIs must list the errors they may throw in `ERRORS` field.
```javascript <!-- embed:./examples/docs.js:scope:DupErrorCodeAPI -->
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
```

### Custom Errors
Custom errors should subclass `RequestError` base class, and provide `STATUS`
and `SCHEMA`.
```javascript
class SessionExpiredException extends RequestError {
  static STATUS = 403
  static SCHEMA = S.obj().max(0)

  constructor (message = 'session expired', data = {}) {
    super(message, data)
  }
}
```

### Dynamic Errors
APIs may need to re-throw an exception returned from another service's API.
Dynamic error exceptions can be instantiated with
`new RequestError(message, data, code)`.

### Return Success Response
Similar to short circuiting to return errors, exceptions can be thrown to
return success responses. It is useful to avoid a long stack of return
statements. Success responses should throw `new RequestOkay(data)`. Data must
match the `RESPONSE` schema.

### Custom Success Status
A non-standard 2xx status code can be used to indicate request success. The
`RESPONSE` field must be assigned with a subclass of `RequestDone` like this
```javascript <!-- embed:./examples/docs.js:scope:NonStandardResponse -->
class NonStandardResponse extends RequestDone {
  static STATUS = 201
}
```

## Database Transactions
`TxAPI` wraps your request in a transaction context
from the [Data Modeling Library](https://github.com/pocketgems/dynamodb):
```javascript
class SomeAPI extends TxAPI {
  static IS_READ_ONLY = false
  async computeResponse () {
    const someItem = await this.tx.get(SomeModel, ...)
    // changes are automatically saved when the request completes (assuming the
    // transaction succeeds, i.e., it doesn't encounter excessive contention or
    // some other problem)
    someItem.someField += 1
  }
}
```

The per-request transaction _only_ attempts to commit if the response code is
less than 400 (e.g., HTTP 200 "OK" or HTTP 302 "Moved Temporarily"). Response
codes 400 and higher are considered errors, and the transaction will be aborted
(no changes will be saved).

By default, `TxAPI` uses a _read-only_ transaction. Set `IS_READ_ONLY` to
`false` (like in the above example) to allow database writes.

### Pre and Post Commit Processing
You can perform extra processing just before the per-request transaction
_attempts_ to commit by overriding the `preCommit(respData)` function (not
called if the transaction is being aborted because the HTTP response code
indicates an error as discussed in the previous section):
```javascript
  async preCommit (respData) {
    // you can do more work within the original transaction if desired
    assert(this.tx !== undefined) // tx is still available

    const user = await tx.get(User, this.req.body.userID)
    if (!user) {
      // you can change the response code (and data)
      throw new RequestError('unknown user')
    }
    else {
      // you can also just modify the response data
      respData.userName = user.name
    }
    return respData
  }
```

Similarly, you can perform extra processing just after the per-request
transaction _successfully_ commits by overriding the `postCommit(respData)`
function (not called if the transaction fails to commit):
```javascript
  async postCommit (respData) {
    // you can do more work UNRELATED to the original transaction (this.tx is
    // not even available here because it isn't valid here)
    assert(this.tx === undefined) // tx has already ended!

    // like preCommit(), you can modify response data (or throw RequestDone or
    // any of its subclasses to change both the response code and data)
    respData.postCommitMsg = 'commit succeeded'
    return respData
  }
```
```diff
--WARNING--
- In rare cases, the post-commit hook **MAY NOT RUN** after a transaction runs
- (e.g., the machine processing the request loses power after the database
- commits the transaction but before the post-commit hook runs). Take care to
- ONLY use the post-commit handler whose logic is okay to not run (on
- rare occasions).
```


### Gotcha: Shared State
Transactions sometimes retry due to contention, etc. It's important to not
store state on `this`, `req` or other heap variables while your transaction
runs, and then reference that data in a retry on accident.
```javascript <!-- embed:./examples/tx.js:scope:RememberingTooMuchAPI -->
class RememberingTooMuchAPI extends TxAPI {
  static NAME = 'unwise memory use'
  static DESC = 'shares state across tx attempts and requests'
  static PATH = '/overshare'
  static IS_READ_ONLY = false
  static SDK_GROUP = null
  static BODY = {
    numTries: S.int.min(0)
  }

  static RESPONSE = {
    numTries: S.int.min(0),
    numTriesOnThisMachine: S.int
  }

  static numTriesOnThisMachine = 0
  constructor (fastify, req, reply) {
    super(fastify, req, reply)
    this.numTries = 0
  }

  async computeResponse (req) {
    // The API instance (this) is created ONCE for each request. It isn't
    // recreated if the transaction retries. So any changes you make to
    // `this` will persist and be visible across retries!
    this.numTries += 1

    // Updating a static variable like this will affect ALL requests being
    // processed by the same machine! Module variables are stored in RAM and
    // are never cleared. They're only in their initial state when a machine
    // first starts. (This is the case regardless of whether you're using
    // transactions).
    this.constructor.numTriesOnThisMachine += 1

    if (this.numTries < req.body.numTries) {
      // force the tx to retry to demonstrate a point
      const err = new Error()
      err.retryable = true
      throw err
    }
    return {
      numTries: this.numTries,
      numTriesOnThisMachine: this.constructor.numTriesOnThisMachine
    }
  }
}
```


### Gotcha: Expensive Computation
It's best to do expensive computation _outside_ transactions in order to
minimize how long the transaction runs and thus minimize the opportunity for
contention. Of course, this is only possible if the computation is not
dependent on data from the database.

Your request _should_ do expensive computation unrelated to the database in its
constructor (`tx` is not defined at that point, and no transaction is running
and so transaction retries will not cause your constructor to re-run).
```javascript
class SomeAPI extends TxAPI {
  constructor (fastify, req, reply) {
    super(fastify, req, reply)
    this.doSomeExpensiveComputation()
    this.computeCalls = 0
    this.postComputeCalls = 0

    // the transaction hasn't started yet (or even been set yet) so the
    // expensive computation will never be re-run, even if the tx retries
    assert(this.tx === undefined) // tx hasn't started yet!
  }
  // ...
}
```

You can also do expensive pre-computation in the `async preTxStart()` function.
This is more flexible than the constructor in that it is `async` and so you can
use `async/await` in it, unlike the constructor:
```javascript
  // this runs after the constructor but before the tx starts
  async preTxStart () {
    assert(this.tx === undefined) // tx hasn't started yet!
    // ...
  }
```

## API Path
A public API's request path is of the form `/<Service Name><API PATH>`. For
example, the leaderboard service has a public API to get leaderboard entries at
the path `/leaderboard/entriesById`. A private API's request path is similar
-- it's just prefixed by the `/internal`, for example
`/internal/leaderboard/score/set`.


## Long API Descriptions
An API description may sometimes be too long to fit on a single line. Use
Node's multiline string for this (also, keep in mind that markdown can be used
in descriptions):
```javascript
  static DESC = `
this will
get combined
into **one** string`
// The APIs description would be: "this will get combined into **one** string"
```


## Swagger Interactive Documentation
With the help of
[fastify-swagger](https://github.com/fastify/fastify-swagger), APIs are
automatically documented using Swagger UI. In addition to reviewing an APIs
specification, you can also _try_ the API from your browser (making API
requests and seeing their output right in your browser!). If your service
exposes many APIs, consider specifying a tag to group them in the generated
documentation:
```javascript
  static TAG = 'Some Group Name'
```

If `TAG` isn't specified, it will be "default". If `TAG` is set to `null` then
the API will be omitted from the Swagger documentation.


## One-Time Setup
Some APIs may need to do some one-time initialization work. For example, our
leaderboard service defines a custom Redis command. This sort of thing can be
done by defining a static `setup()` method on your API:
```javascript
static async setup (fastify) {
    fastify.redis.defineCommand('updateScoreIfHigher', {
      // ...
    })
}
```


## Asynchronous Processing
Each service is served by multiple virtual machines (VM). Each VM will
typically accept _multiple_ requests for processing at once. However, each VM
is only allocated a single processor core, and request processing is
single-threaded (in a single process). This means each machine is only able to
physically execute one request at a time. We use JavaScript's `async`/`await`
syntax to achieve lightweight concurrency; understanding this concurrency model
is important, but beyond the scope of this documentation so check
[this async/await primer](https://medium.com/@garyo_83013/javascript-promises-and-async-await-for-c-programmers-aa349026f2e7)
to learn more.

This is a common setup because APIs tend to spend a lot of their time blocked
waiting on I/O, typically in the form of HTTP requests to other services (e.g.,
the database, cache or other Todea services). It is critical to never perform
synchronous I/O as this would stall the CPU (and every request on the VM) until
the I/O completes. Use `async`/`await` to asynchronously block on I/O and
enable the VM to continue productively using the CPU to process other requests.
Services with long-running CPU-bound requests may need to tweak (lower) request
processing concurrency to reduce queuing delays as the CPU works on one request
for an extended time, ignoring and starving other requests and possibly leading
to unacceptably high latency.
```javascript
// the "async" keyword on this method is actually very important!
async computeResponse() {
  // whenever possible, asynchronous work should be done in PARALLEL (rather
  // than serially); in this example we make two API calls at the same time
  // and then yield until both API calls have returned
  const results = await Promise.all([
    this.callAPI({/* params omitted from example */}),
    this.callAPI({/* params omitted again */})
  ])
  // use the two results to compute our response...
}
```

## Cross Origin (CORS)
APIs which need be accessed from a web browser must indicate which hostnames
they may be accessed from. This is required for compatibility with browser
safety features. Without it, browsers will prevent the APIs from being
requested.

You can specify the CORS origin through the `CORS_ORIGIN` flag. For example,
```js
static CORS_ORIGIN = 'some.example.com'
```

You may also set the API to allow any origin like this:
```js
static CORS_ORIGIN = '*'
```

# Niche Concepts
This section explains niche functionality.

## Pagination
Paginated APIs break up large responses into small chunks which can be more
quickly returned for a more responsive user experience. A typical pagination
API takes a pagination token and amount of data to fetch as input, and returns
a list of data along with a token for the next page.
```javascript
class PaginatedAPI extends API {
  static BODY = {
    nextToken: S.str.optional(),
    amount: S.int.min(1)
  }

  static RESPONSE = {
    data: S.arr(S.str),
    nextToken: S.str.optional()
  }

  ...
}
```

This library simplifies the creation of a paginated API to a single
`ENABLE_PAGINATION` flag. When enabled, `nextToken` and `amount` fields are
automatically added to the API's query string (`QS`), and `nextToken` is
automatically added to the RESPONSE schema. These automatically added fields
should not be manually added. In addition, `RESPONSE` must have exactly one
schema field corresponding to an array schema.
```javascript <!-- embed:./examples/pagination.js:scope:PaginatedAPI -->
class PaginatedAPI extends API {
  static DESC = 'Paginated API'
  static PATH = '/paginated'
  static ENABLE_PAGINATION = true
  static RESPONSE = {
    list: S.arr(S.str)
  }

  async computeResponse (req) {
    const { amount, nextToken } = req.query
    return fetchPage({ amount, nextToken })
  }
}
```
A paginated API (with ENABLE_PAGINATION = true or manually defined following
the same schema) has extended paginator support in generated SDKs. See the SDK
documentation for detail.

## Other API Input Data Options
Todea APIs are typically requested via the HTTP POST method. API-specific
inputs are typically sent in the request body in JSON format (though some
universal inputs are sent in HTTP headers, such as which app and user sent the
request). API outputs are typically transmitted as JSON data in the HTTP
response body.

Occasionally, it may be necessary for an API to use a different HTTP method, or
different input or output types or formats. One possibility is when integrating
with a third-party who requires this. However, our own APIs should be
consistent and stick to HTTP POST data with HTTP request and response bodies
being JSON formatted.

Here is an example API which differs from our convention in every way:
  * It is requested via the HTTP PUT method
  * It receives input from many different sources:
    * query string
    * request body (in a custom format, not JSON)
    * headers
    * request path
  * Its response body is XML formatted
```javascript <!-- embed:./examples/docs.js:scope:NonStandardAddNumbersAPI -->
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
```


## Non-app specific APIs
By default, APIs expect to be told which app they pertain to (using the custom
x-app HTTP header). If an API does not operate in the context of a specific
app, then this requirement can be removed:
```javascript
// this returns true by default but it can be overridden
static IS_APP_HEADER_REQUIRED = false
```


## Controlling API Visibility in SDKs
Some APIs are meant to be consumed by client applications (UserAPIs), while
some are meant to be consumed by admin tools (AdminAPIs), and yet some are
meant to be consumed by peer Todea services (InternalAPIs). APIs are
grouped together by the intended consumer using the `SDK_GROUP` flag.
```javascript
  static SDK_GROUP = 'user'
  // or
  static SDK_GROUP = 'service'
  // or
  static SDK_GROUP = 'admin'
```

Some APIs may not be intended to be consumed by any SDK. For example, an URI
for resetting password may only be intended to be consumed via a web browser.
You can prevent the API from being included in SDKs (keeping the SDK
smaller an bd simpler) by setting the flag to `null`:
```javascript
  static SDK_GROUP = null
```


## Custom Middleware
If desired, each API can be run with custom middleware and other fastify
options. To do this, you'll need to override the `register()` method and
call `app.register()` as desired.

## Gotcha: Sharing Schemas
In the Leaderboard service, multiple APIs share these parameters:
```javascript
  static get BODY () {
    return S.obj({
      leaderboard: S.SCHEMAS.STR_ANDU,
      hasTiebreakers: S.bool.default(true).desc(
        'must be set to true if the leaderboard uses tiebreakers')
    })
  }
```

Notice that `BODY` is defined as a getter function, not a static member
variable. The reason is that multiple subclasses call `super.BODY` to extend
the object. They each need their own copy of the schema (which the getter
creates and returns). If they both built from the same copy, it would cause
internal problems with the schema object.


## Gotcha: Unrelated API Parameters with the Same Name
Sometimes you might have multiple APIs which all have an input parameter with
the same generic name (e.g., "id") but expect difference schemas for each of
these input parameters. In this case, [c2j](../docs/aws-c2j.md) will fail
because it doesn't know how to tell the difference between these parameters. To
differentiate them you need to specify a unique title for each distinct schema,
for example:
```javascript
  static BODY = S.obj({ id: S.str.pattern(/.../).title('some unique title') })
```

## Gotcha: Response for APIs included in SDKs must be objects
Todea SDKs require response types to be JSON objects. This is a best practice
because it makes it easier to add additional data to the response as the API
evolves without breaking compatibility with older clients. It's also a
technical limitation because the tech on which our SDKs are built currently
only supports JSON response types.

In case of an error like "API XYZ response must be object", you can do one of
the following:
1. Define response as an object, e.g. `static RESPONSE = { result: ... }`
2. Remove the API from SDK, e.g. `static SDK_GROUP = null`

## Localhost Cross-Origin Resource Sharing (CORS)
When running a service locally for testing purposes, it will enable CORS
requests for all APIs from `http://localhost:3000`. This facilitates testing of
web applications also running locally that depend on the service. In the cloud,
CORS is not enabled (unless you choose to enable it).

# Appendix
The samples in this readme can be found in the APIs defined for unit testing
this library in `examples/docs.js`.

When necessary it is possible to use static getter functions instead of static
member variables. For example, here's a contrived example that only accepts "n"
as an input on localhost:
```javascript
  // we use a getter function here so that we can more convenient define th
  // body using more complex logic than usual
  static get BODY () {
    if (process.env.NODE_ENV === 'localhost') {
      return S.obj({ n: S.int })
    }
    return S.obj()
  }
```
