const { API, TxAPI } = require('..')

class CORSTestAPI extends API {
  static DESC = 'CORS test'
  async computeResponse () { /* no-op */ }
}

class CrossAnyOriginAPI extends CORSTestAPI {
  static NAME = 'wildcard CORS origin'
  static PATH = '/api/cors/any'
  static CORS_ORIGIN = '*'
}

// subclass from UnauthenticatedAPI to check its different default CORS headers
class CrossOneOriginAPI extends TxAPI {
  static NAME = 'one CORS origin'
  static DESC = 'with app header'
  static PATH = '/api/cors/one'
  static CORS_ORIGIN = 'some.example.com'
  static SDK_GROUP = null
  static get CORS_HEADERS () {
    return [...super.CORS_HEADERS, 'x-key']
  }

  async computeResponse () { /* no-op */ }
}

class CrossNoAppOriginAPI extends TxAPI {
  static NAME = 'one CORS origin'
  static DESC = 'without app header'
  static PATH = '/api/cors/noAppHeader'
  static CORS_ORIGIN = 'some.example.com'
  static SDK_GROUP = null
  static get CORS_HEADERS () { return [...super.CORS_HEADERS, 'X-More'] }
  async computeResponse () { /* no-op */ }
}

class CrossWebAppOriginAPI extends CORSTestAPI {
  static NAME = 'web app CORS origin'
  static PATH = '/api/cors/webApp'
  static CORS_ORIGIN = 'some.example.com'
}

class CrossOriginCustomHeadersAPI extends CORSTestAPI {
  static NAME = 'custom headers CORS'
  static PATH = '/api/cors/headers'
  static CORS_ORIGIN = 'another.example.com'
  static CORS_HEADERS = ['X-One', 'X-Two']
}

class CrossOriginNoHeadersAPI extends CORSTestAPI {
  static NAME = 'custom headers CORS'
  static PATH = '/api/cors/noHeaders'
  static CORS_ORIGIN = 'another.example.com'
  static CORS_HEADERS = null
}

class NotCrossOriginAPI extends CORSTestAPI {
  static NAME = 'not CORS origin'
  static PATH = '/api/cors/nope'
}

module.exports = {
  CrossAnyOriginAPI,
  CrossNoAppOriginAPI,
  CrossOneOriginAPI,
  CrossOriginCustomHeadersAPI,
  CrossOriginNoHeadersAPI,
  CrossWebAppOriginAPI,
  NotCrossOriginAPI
}
