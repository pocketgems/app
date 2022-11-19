const { BaseAppTest, runTests } = require('./base-test')

function getURI (path) {
  return `/unittest${path}`
}

class DocsTest extends BaseAppTest {
  async testNonStandardReturnCode () {
    await this.app.post(getURI('/nonStandardReturnCode'))
      .expect(201)
  }

  async testDupErrorCode () {
    const check = async (exception, expCode) => {
      await this.app.post(getURI('/dupErrorCode'))
        .set('Content-Type', 'application/json')
        .send({ exception })
        .expect(expCode)
    }

    await check('notfound', 404)
    await check('other', 404)
  }

  async testManualCode () {
    const check = async (manualCode, expCode) => {
      await this.app.post(getURI('/setCode'))
        .set('Content-Type', 'application/json')
        .send({ manualCode })
        .expect(expCode)
    }

    await check(200, 200)
    await check(401, 401)
    await check(501, 501)
  }

  async testTimeAPI () {
    const result = await this.app.post(getURI('/whatTimeIsIt')).expect(200)
    const now = new Date().getTime() / 1000
    const serverTime = result.body.epoch
    const secsApart = Math.abs(now - serverTime)
    // may not be exact if there's a delay between API formulating its
    // response and the unit test code computing the current time (unlikely
    // to be large unless execution is paused at just the right moment)
    expect(secsApart).toBeLessThan(60) // probably <<1
  }

  async testAdditionAPI () {
    let result = await this.app.post(getURI('/add'))
      .set('Content-Type', 'application/json')
      .send({ num1: 1, num2: 22, more: [8, 9] })
      .expect(200)
    expect(+result.text).toBe(1 + 22 + 8 + 9)

    result = await this.app.post(getURI('/add'))
      .set('Content-Type', 'application/json')
      .send({ num1: 1 })
      .expect(200)
    expect(+result.text).toBe(11)
  }

  async testNonStandardAdditionAPI () {
    let result = await this.app.put(getURI('/add/66/777'))
      .query({ num1: 1, num2: 22 })
      .set('Content-Type', 'wackyCustom_thing')
      .send('wacky!{ "num3": 333, "num4": 4444, "more": [8, 9] }')
      .set('num5', 55555)
      .expect(200)
    let expSum = 1 + 22 + 333 + 4444 + 55555 + 66 + 777 + 8 + 9
    expect(result.text).toBe(`<sum>${expSum}</sum>`)

    result = await this.app.put(getURI('/add/66/777'))
      .query({ num1: 1, num2: 22 })
      .set('Content-Type', 'wackyCustom_thing')
      .send('wacky!{ "num3": 333, "num4": 4444 }')
      .set('num5', 55555)
      .expect(200)
    expSum = 1 + 22 + 333 + 4444 + 55555 + 66 + 777
    expect(result.text).toBe(`<sum>${expSum}</sum>`)
  }

  async testNonStandardAdditionAPIInvalidParams () {
    await this.app.put(getURI('/add/66/777'))
      .query({ num1: 1, num2: 22, more: [8, 9] })
      .set('Content-Type', 'wackyCustom_thing')
      .send('{ "num3": 333, "num4": 4444 }')
      .set('num5', 55555)
      .expect(500)

    await this.app.put(getURI('/add/66/777'))
      .query({ num1: 1, num2: 22, more: [8, 9] })
      .set('Content-Type', 'wackyCustom_thing')
      .send('wacky!{{')
      .set('num5', 55555)
      .expect(400)
  }

  async testValidatedObjectOutput () {
    const result = await this.app.post(getURI('/getJSON')).expect(200)
    expect(result.body).toEqual({
      canHaveArbitraryJSONContent: true,
      hello: 'world',
      address: {
        houseNumber: 123,
        street: 'Bush St'
      },
      walkScore: 3.14
    })
  }

  async testValidatedDocumentedObjectOutput () {
    const result = await this.app.post(getURI('/getDocumentedJSON'))
      .expect(200)
    expect(result.body).toEqual({
      dragons: ['d1', 'd2'],
      guineaPigs: ['Peggy', 'Angelica', 'Eliza'],
      optionalValue: 3
    })
  }

  async testThrowToReturn () {
    const resultErr = await this.app.post(getURI('/throwToReturn'))
      .query({ shouldError: true })
      .expect(400)
    expect(resultErr.body.message).toEqual('run away!')
    const resultOk = await this.app.post(getURI('/throwToReturn'))
      .query({ shouldError: false })
      .expect(200)
    expect(resultOk.body).toEqual({ hello: 'world' })
  }

  async testThrowToReturnFromConstructor () {
    const path = getURI('/throwToReturnFromConstructor')
    let ret = await this.app.post(path)
      .set('Content-Type', 'application/json')
      .send({ shouldError: true })
      .expect(400)
    expect(ret.body.message).toBe('threw in constructor')
    ret = await this.app.post(path)
      .set('Content-Type', 'application/json')
      .send({ shouldError: false })
      .expect(200)
    expect(ret.body.msg).toBe('threw an okay in constructor')
  }

  async testPreCommit () {
    const app = this.app
    async function check (code, shouldThrow, shouldPreCommitThrow) {
      const ret = await app.post(getURI('/preCommit'))
        .query({
          shouldThrow: shouldThrow,
          shouldPreCommitThrow: shouldPreCommitThrow,
          code: code
        })
        .expect(code)
      // preCommit() is called only if computeResponse() ends with code 200
      const expBody = { main: true }
      const mainDidNotThrow = code < 400 || [
        'RequestOkay', 'return'].indexOf(shouldThrow) !== -1
      if (mainDidNotThrow) {
        expBody.preCommit = true
      }
      if (code < 400) {
        expBody.committed = true
      }
      if (shouldThrow === 'RequestError') {
        expect(ret.body.message).toEqual(JSON.stringify({ main: true }))
      } else if (expBody.preCommit && shouldPreCommitThrow === 'RequestError') {
        expect(ret.body.message).toEqual(JSON.stringify({
          main: true, preCommit: true
        }))
      } else if (code === 301) {
        expect(ret.text).toEqual('')
      } else if (shouldPreCommitThrow !== 'nothrow') {
        expect(ret.body).toEqual(expBody)
      } else {
        expect(ret.text).toContain('invalid respType')
      }
    }
    // verify that preCommit gets called when returning with non-error code
    const okayTypes = ['RequestOkay', 'return', 'RequestDone']
    for (let i = 0; i < okayTypes.length; i++) {
      // exception is raised
      await check(200, 'RequestDone', okayTypes[i])
      // RequestDone is the only way to emit a success code other than 200
      if (okayTypes[i] !== 'RequestOkay') {
        await check(301, 'RequestDone', okayTypes[i])
      }
      // should also be called when other exceptions are raised
      await check(200, 'RequestOkay', okayTypes[i])
      // and when returning normally
      await check(200, 'return', okayTypes[i])
    }
    // ending with a non-200 non-300 status code bypasses preCommit
    await check(400, 'RequestError', 'does not matter')
    await check(500, 'RequestError', 'does not matter')
    await check(500, 'RequestInvalidReturn', 'nothrow')
    // preCommit throwing after success should work ... the transdaction should
    // NOT commit in this case!
    await check(407, 'RequestOkay', 'RequestError')
  }

  async testStatusCodePropagation () {
    await this.app.post(getURI('/api/errorPropagation'))
      .send({ throw: 'httpCode' })
      .expect(456)
    await this.app.post(getURI('/api/errorPropagation'))
      .send({ throw: 'statusCode' })
      .expect(500)
  }
}

runTests(DocsTest)
