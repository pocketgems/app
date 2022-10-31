const assert = require('assert')

const db = require('@pocketgems/dynamodb')
const S = require('@pocketgems/schema')
const uuidv4 = require('uuid').v4

const { TxAPI } = require('..')

const SimpleAPI = require('./simple')

class JsonSchemaData extends db.Model {
  static KEY = { id: S.str.min(1) }
  static FIELDS = {
    json: S.obj({
      bar: S.obj({
        foo: S.obj(),
        foo1: S.obj({
          key: S.obj({
            zoo: S.int,
            zoo1: S.int
          })
        }),
        foo2: S.int
      })
    })
  }

  updateInvalid () {
    this.json = {
      bar: {
        foo: {
          [uuidv4()]: 123
        },
        foo1: {
          key: {
            zoo: 1,
            zoo1: 1231
          },
          invalid: 123
        },
        foo2: 'this is a bad value but should be in our err message'
      }
    }
  }
}

class CountForTx extends db.Model {
  static FIELDS = { n: S.int.default(0) }
}

class DBWithTXAPI extends TxAPI {
  static NAME = 'example for db with tx api'
  static DESC = 'uses automatic request wrapping in a tx'
  static PATH = '/dbWithTxAPI'
  static IS_READ_ONLY = false
  static SDK_GROUP = null
  static BODY = {
    id: S.str,
    delta: S.int,
    numTimesToRetry: S.int.min(0),
    failInPreCommit: S.bool
  }

  static RESPONSE = {
    n: S.int,
    computeCalls: S.int,
    postComputeCalls: S.int,
    postCommitMsg: S.str
  }

  constructor (fastify, req, reply) {
    super(fastify, req, reply)
    this.doSomeExpensiveComputation()
    this.computeCalls = 0
    this.preCommitCalls = 0

    // the transaction hasn't started yet (or even been set yet) so the
    // expensive computation will never be re-run, even if the tx retries
    assert(this.tx === undefined) // tx hasn't started yet!
  }

  doSomeExpensiveComputation () {
    assert(this.base === undefined, 'this should only be called once')
    this.base = 5
  }

  async computeResponse (req) {
    this.computeCalls += 1
    if (!req.body.failInPreCommit) {
      if (this.computeCalls < req.body.numTimesToRetry + 1) {
        this.fail('computeResponse')
      }
    }
    const data = CountForTx.data({ id: req.body.id })
    const item = await this.tx.get(data, { createIfMissing: true })
    item.n += this.base + req.body.delta
    return {
      n: item.n,
      computeCalls: this.computeCalls
    }
  }

  async preCommit (respData) {
    this.preCommitCalls += 1
    if (this.req.body.failInPreCommit) {
      if (this.preCommitCalls < this.req.body.numTimesToRetry + 1) {
        this.fail('preCommit')
      }
    }
    respData.postComputeCalls = this.preCommitCalls
    return respData
  }

  fail (fromFuncName) {
    const err = new Error(`force a few retries from ${fromFuncName}()`)
    err.retryable = true
    throw err
  }

  async postCommit (respData) {
    // you can do more work UNRELATED to the original transaction (this.tx is
    // not even available here because it isn't valid here)
    assert(this.tx === undefined) // tx has already ended!

    // like preCommit(), you can modify response data (or throw RequestDone or
    // any of its subclasses to change both the response code and data)
    respData.postCommitMsg = 'commit succeeded'
    return respData
  }
}

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

class Throw500API extends SimpleAPI {
  static PATH = '/throw500'
  async computeResponse () {
    return invalidVariable.prop() // eslint-disable-line no-undef
  }
}

class Throw400API extends SimpleAPI {
  static PATH = '/clienterrors'
  static BODY = { json: S.obj() }
  async computeResponse () {
    return ''
  }
}

class JsonSchemaAPI extends SimpleAPI {
  static PATH = '/jsonschema'
  static DESC = 'Reads then puts a simple model with a large json object'
  static BODY = { modelCount: S.int }
  async computeResponse () {
    const modelIdx = Math.floor(Math.random() * this.req.body.modelCount)
    await db.Transaction.run(async tx => {
      const data = {
        id: 'model' + modelIdx.toString(),
        json: { bar: { foo: {}, foo1: { key: { zoo: 1, zoo1: 2 } }, foo2: 3 } }
      }
      const model = await tx.get(
        JsonSchemaData,
        data,
        { createIfMissing: true })
      model.updateInvalid()
    }).catch(err => {
      const expText = 'Validation Error: JsonSchemaData.json'
      /* istanbul ignore next */
      if (err.message !== expText) {
        // we didn't get the error we expected
        throw new Error('should not get here: ' + err.message)
      }
    })
  }
}

module.exports = {
  DBWithTXAPI,
  JsonSchemaAPI,
  RememberingTooMuchAPI,
  Throw400API,
  Throw500API,
  CountForTx,
  JsonSchemaData
}
