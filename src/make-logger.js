// istanbul ignore file
const querystring = require('querystring')

const wrap = require('word-wrap')
// for localhost and unit testing, output to the console INSTEAD of to stdout
// via pino (so that jest captures the output and groups it with the right test
// suite)
function getLocalhostOverrides () {
  const prefixText = '/' + process.env.SERVICE + '/src/'
  function prettifier () {
    return (obj) => {
      if (obj.req) {
        const indent = ''
        if (!obj.status) {
          console.log(indent, obj.req.method, obj.req.path)
        } else {
          // output the status code and (if any) error message
          const msgs = wrap(obj.msg || '', { width: 80, indent }).split('\n')
          console.log(indent, ' \u2514 HTTP', obj.status, msgs[0])
          msgs.slice(1).forEach(msg => {
            console.log(indent, msg)
          })
          if (obj.error && obj.status >= 500) {
            console.log(`${indent}Error: ${JSON.stringify(obj.error, null, 2)}`)
          }
          if (obj.stack) {
            for (let i = 0; i < obj.stack.length; i++) {
              console.log('  ', obj.stack[i])
            }
          }
        }
      } else {
        // 1) Get the filename and line number the log message is from
        // the index of the first non-pino line may change in future versions
        // of fastify or pino; might be better to search each line until we
        // find /<service>/src (if present)
        const firstNonPinoLine = (new Error()).stack.split('\n')[5]
        const appFolderIdx = firstNonPinoLine.indexOf(prefixText)
        let prefix = ''
        if (appFolderIdx !== -1) {
          // prefix log message with filename and line number when logs
          // originated in our app's source code
          prefix = firstNonPinoLine.substring(
            appFolderIdx + 9,
            firstNonPinoLine.lastIndexOf(':')) + '  '
        }

        // 2) Create the logm msg: file, line, log message and log object
        const indent = '  \u2502 '
        const logObj = {}
        const ignoredKeys = ['level', 'msg', 'reqId', 'time', 'v']
        Object.getOwnPropertyNames(obj).forEach(key => {
          if (ignoredKeys.indexOf(key) === -1) {
            logObj[key] = obj[key]
          }
        })
        let msg = indent + prefix + (obj.msg || '')
        if (Object.keys(logObj).length) {
          msg += (obj.msg ? ' ' : '') + JSON.stringify(logObj)
        }
        if (obj.level < 30) {
          console.debug(msg)
        } else if (obj.level >= 50) {
          console.error(msg)
        } else if (obj.level >= 40) {
          console.warn(msg)
        } else {
          console.log(msg)
        }
      }
      return '' // skip pino logging
    }
  }
  return { prettyPrint: true, prettifier: prettifier }
}

module.exports = function makeCustomLogger (isLocalhost) {
  function serializeReq (req) {
    const q = req.query
    if (req.raw) {
      req = req.raw
    }
    const path = req.path
    const qs = req.qs
    return {
      app: req.headers['x-app'] || '',
      uid: req.headers['x-uid'] || '',
      method: req.method,
      ua: req.headers['user-agent'] || '',
      path: path,
      q: q || querystring.decode(qs)
    }
  }
  const logger = {
    base: null, // omit pino default fields like pid and hostname
    level: (process.env.NODE_ENV === 'prod') ? 'info' : 'debug',
    serializers: {
      req: serializeReq,
      res: (res) => {
        return { status: res.statusCode, req: serializeReq(res.req) }
      }
    }
  }
  // on localhost, we customize the logs to optimize for console-based debugging
  if (isLocalhost) {
    Object.assign(logger, getLocalhostOverrides())
  }
  return logger
}
