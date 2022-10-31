const { API, RESPONSES } = require('../src')

class SimpleAPI extends API {
  static DESC = 'API for unit testing'
  static IS_READ_ONLY = false
  static RESPONSE = RESPONSES.UNVALIDATED
  static SDK_GROUP = null
}

module.exports = SimpleAPI
