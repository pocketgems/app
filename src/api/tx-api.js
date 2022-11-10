const db = require('@pocketgems/dynamodb')

const { API } = require('./api')

/**
 * Thrown to avoid committing a transaction when an error occurs.
 * @access private
 */
class TransactionAborted extends Error {
  constructor (respData) {
    super()
    this.respData = respData
    this.retryable = false
  }
}

/**
 * An API whose response is computed inside a transaction.
 * @public
 * @class
 */
class TxAPI extends API {
  static IS_READ_ONLY = true

  async _computeResponse () {
    await this.preTxStart()

    let ret
    try {
      ret = await db.Transaction.run(async tx => {
        if (this.constructor.IS_READ_ONLY) {
          tx.makeReadOnly()
        }
        this.tx = tx
        this.req.tx = tx
        let respData = await super._computeResponse()
        if (this.__reply.statusCode < 400) {
          // pre-commit hook may change the response data (and status code!)
          respData = await this._callAndHandleRequestDone(
            this.preCommit, respData)
        }
        // if the response code indicates an error, then don't commit
        if (this.__reply.statusCode >= 400) {
          throw new TransactionAborted(respData)
        }
        return respData
      })
    } catch (e) {
      if (e instanceof TransactionAborted) {
        return e.respData
      } else {
        throw e
      }
    } finally {
      delete this.tx
      delete this.req.tx
    }

    // _computeResponse() is called within _callAndHandleRequestDone; so we
    // don't need to wrap this call to postCommit() in it (redundant)
    return this.postCommit(ret)
  }

  /**
   * Called just before the transaction starts. Useful to do async computation
   * outside the transaction (reducing the window for contention).
   */
  async preTxStart () {}

  /**
   * Called just before the transaction ATTEMPTS to commit. May alter the
   * response by returning a new response value, or throwing RequestDone.
   * Throwing an error will be propagated and handled by Transaction.run(),
   * and will prevent the transaction from committing (unless the error is
   * retryable).
   *
   * @param {*} respData the response data
   * @returns {*} the (possibly updated) response data
   */
  async preCommit (respData) { return respData }

  /**
   * Called after the transaction commits (and ONLY if it commits
   * successfully). May alter the response by returning a new response value,
   * or throwing RequestDone.
   *
   * @param {*} respData the response data
   * @returns {*} the (possibly updated) response data
   */
  async postCommit (respData) { return respData }
}

module.exports = { TxAPI }
