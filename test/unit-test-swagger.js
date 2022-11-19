const { BaseAppTest, runTests } = require('./base-test')

class SwaggerTest extends BaseAppTest {
  async testDocs () {
    const result = await this.app.get('/docs').send()
    expect(result.status).toBe(302)
  }
}

runTests(SwaggerTest)
