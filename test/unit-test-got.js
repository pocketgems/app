const zlib = require('zlib')

jest.mock('got')
const { BaseTest, runTests } = require('@pocketgems/unit-test')
const mockedGot = require('got')

const gotWrapper = require('../src/got')

// Tests to make sure new JS features introduced in node14
// are working, and context highlight, linter etc are compatible
class CompressionTest extends BaseTest {
  async testCompression () {
    const mock = mockedGot.mockImplementation(({ body }) => {
      expect(body).toEqual(zlib.brotliCompressSync('321'))
    })
    await gotWrapper({
      url: '123',
      body: '321',
      compress: true
    })
    mock.mockRestore()

    const mock2 = mockedGot.mockImplementation(({ body }) => {
      expect(body).toEqual(zlib.brotliCompressSync(JSON.stringify({
        data: '321'
      })))
    })
    await gotWrapper({
      url: '123',
      json: {
        data: '321'
      },
      compress: true
    })
    mock2.mockRestore()
  }

  async testNoCompression () {
    const mock = mockedGot.mockImplementation(({ body }) => {
      expect(body).toBe('321')
    })
    await gotWrapper({
      url: '123',
      body: '321',
      compress: false
    })
    mock.mockRestore()
  }
}

runTests(CompressionTest)
