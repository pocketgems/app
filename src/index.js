const api = require('./api')
const ComponentRegistrator = require('./component-registrator')
const makeApp = require('./make-app')

module.exports = {
  ...api,
  makeApp,
  ComponentRegistrator
}
