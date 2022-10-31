const fastify = require('fastify')
const cookiePlugin = require('fastify-cookie')

const makeLogger = require('../src/make-logger')
const c2jPlugin = require('../src/plugins/aws-c2j')
const compressPlugin = require('../src/plugins/compress')
const contentParserPlugin = require('../src/plugins/content-parser')
const errorHandlerPlugin = require('../src/plugins/error-handler')
const healthCheckPlugin = require('../src/plugins/health-check')
const latencyTrackerPlugin = require('../src/plugins/latency-tracker')

const ComponentRegistrator = require('./component-registrator')

async function makeApp ({
  service,
  components,
  RegistratorCls = ComponentRegistrator,
  cookieSecret,
  returnErrorDetail,
  healthCheckPath,
  apiId,
  apiName,
  apiVersion,
  apiSignatureVersion,
  apiGlobalEndpoint
}) {
  const app = fastify({
    ignoreTrailingSlash: true,
    disableRequestLogging: true,
    logger: makeLogger(process.env.NODE_ENV === 'localhost'),
    ajv: {
      customOptions: {
        removeAdditional: false,
        allErrors: process.env.NODE_ENV !== 'prod'
      }
    }
  })

  app.register(cookiePlugin, { cookie: { secret: cookieSecret } })
    .register(compressPlugin)
    .register(contentParserPlugin)
    .register(latencyTrackerPlugin)
    .register(errorHandlerPlugin, { errorHandler: { returnErrorDetail } })
    .register(healthCheckPlugin, { healthCheck: { path: healthCheckPath } })

  const registrator = new RegistratorCls(app, service)
  for (const component of Object.values(components)) {
    if (component.register) {
      component.register(registrator)
    }
  }
  await Promise.all(registrator.promises)

  app.register(c2jPlugin, {
    c2j: {
      pathPrefix: `/${service}/c2j`,
      apiId: apiId,
      name: apiName,
      version: apiVersion,
      apis: registrator.apis,
      signatureVersion: apiSignatureVersion,
      globalEndpoint: apiGlobalEndpoint
    }
  })

  return app
}

module.exports = makeApp
