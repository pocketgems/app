const api = require('./api')
const ComponentRegistrator = require('./component-registrator')
const EXCEPTIONS = require('./exception')
const makeApp = require('./make-app')
const RESPONSES = require('./response')
const txAPI = require('./tx-api')

module.exports = {
  ...api,
  ...txAPI,
  EXCEPTIONS,
  makeApp,
  RESPONSES,
  ComponentRegistrator
}
