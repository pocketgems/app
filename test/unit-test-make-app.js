const { makeApp } = require('../src')

const { BaseTest, runTests } = require('./base-test')

class MakeAppTest extends BaseTest {
  async testValidation () {
    const commonConfig = {
      service: 'test',
      components: [],
      cookie: { disabled: true },
      healthCheck: { disabled: true },
      awsC2j: { disabled: true }
    }
    await expect(makeApp())
      .rejects.toThrow('Missing required value for service')
    await expect(makeApp({ ...commonConfig, cookie: { invalid: false } }))
      .rejects.toThrow('Unknown config invalid')
    await expect(makeApp({ ...commonConfig, cookie: { disabled: false } }))
      .rejects.toThrow('Missing required value for')
    await makeApp({
      ...commonConfig
    })
  }
}

runTests(MakeAppTest)
