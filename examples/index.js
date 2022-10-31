const basic = require('./basic')
const cors = require('./cors')
const docs = require('./docs')
const pagination = require('./pagination')
const tx = require('./tx')

module.exports = {
  ...basic,
  ...cors,
  ...docs,
  ...pagination,
  ...tx,
  notAPI: {}
}
