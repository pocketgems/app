const { BaseAppTest, runTests } = require('./base-test')

function getURI (path) {
  return `/unittest${path}`
}

class LatencyTrackerTest extends BaseAppTest {
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
}

runTests(LatencyTrackerTest)
