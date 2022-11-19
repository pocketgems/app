const fastify = require('fastify')

const ComponentRegistrator = require('./component-registrator')
const makeLogger = require('./make-logger')
const awsPlugin = require('./plugins/aws-c2j')
const compressPlugin = require('./plugins/compress')
const contentParserPlugin = require('./plugins/content-parser')
const cookiePlugin = require('./plugins/cookie')
const errorHandlerPlugin = require('./plugins/error-handler')
const healthCheckPlugin = require('./plugins/health-check')
const latencyTrackerPlugin = require('./plugins/latency-tracker')
const swaggerPlugin = require('./plugins/swagger')

/**
 * @typedef {object} CookieConfig
 * @property {boolean} [disabled=false] Adds fastify-cookie plugin
 * @property {string} [secret] A secret to use to secure cookie
 */
const COOKIE_CONFIG = {
  disabled: false,
  secret: undefined
}

/**
 * @typedef {object} LoggingConfig
 * @property {boolean} [unittesting=false] Whether output logs to console with
 *   pretty printing
 * @property {boolean} [reportAllErrors=false] Whether include all API
 *   validation errors in error logging. Recommend to keep it off for production,
 *   on for testing.
 * @property {boolean} [reportErrorDetail=false] Whether include all details
 *   of an error. Recommend to keep it off for remote testing, on for local
 *   testing.
 */
const LOGGING_CONFIG = {
  unittesting: false,
  reportAllErrors: false,
  reportErrorDetail: false
}

/**
 * @typedef {object} HealthCheckConfig
 * @property {boolean} [disabled=false] Whether to add a health check endpoint
 *   that simply returns 200.
 * @property {string} [path='/'] The path to the health check endpoint.
 */
const HEALTH_CHECK_CONFIG = {
  disabled: false,
  path: '/'
}

/**
 * @typedef {object} AwsC2jConfig
 * @property {boolean} [disabled=false] Whether to disable AWS C2J schema APIs
 * @property {string} [path='/c2j'] The path to the schema endpoints.
 * @property {string} displayName The SDK's name, e.g. IAM, Leaderboard,
 *   CloudFront. This is the display name of the generated SDK.
 * @property {string} version The version of the SDK, e.g. 2022-02-20.
 * @property {string} signatureVersion The signature version to use. See AWS
 *   SDK's supported signature versions, e.g. 'v4'. Or you can create your own
 *   signer classes in forked AWS SDKs.
 * @property {string} globalEndpoint The endpoint to use
 * @property {Array<string>} globalHeaders Headers setup globally at SDK level,
 *   so individual APIs should not include these. For example,
 *   aws_access_key_id
 */
const AWS_C2J_CONFIG = {
  disabled: false,
  path: '/c2j',
  displayName: undefined,
  version: undefined,
  signatureVersion: undefined,
  globalEndpoint: undefined,
  globalHeaders: []
}

/**
 * @typedef {object} SwaggerConfig
 * @property {boolean} [disabled=false] Whether to disable AWS C2J schema APIs
 * @property {Array<string>} [servers=[]] The host endpoint (scheme + domain) to
 *   send requests to
 * @property {Array<string>} [authHeaders=[]] Authentication headers
 */
const SWAGGER_CONFIG = {
  disabled: false,
  servers: [],
  authHeaders: []
}

/**
 * @typedef {object} LatencyTrackerConfig
 * @property {boolean} [disabled=false] Whether to add a health check endpoint
 *   that simply returns 200.
 * @property {string} [path='/'] The path to the health check endpoint.
 */
const LATENCY_TRACKER_CONFIG = {
  disabled: false,
  header: 'x-latency-ms'
}

const PARAMS_CONFIG = {
  service: undefined,
  components: undefined,
  RegistratorCls: ComponentRegistrator,
  awsC2j: {},
  cookie: {},
  healthCheck: {},
  latencyTracker: {},
  logging: {},
  swagger: {}
}

function loadConfigDefault (config, defaultConfig) {
  for (const key of Object.keys(config)) {
    if (!Object.prototype.hasOwnProperty.call(defaultConfig, key)) {
      throw new Error(`Unknown config ${key}`)
    }
  }
  if (!config.disabled) {
    for (const [key, defaultValue] of Object.entries(defaultConfig)) {
      if (defaultValue === undefined && !config[key]) {
        throw new Error(`Missing required value for ${key}`)
      }
    }
  }
  Object.assign(config, { ...defaultConfig, ...config })
}

/**
 * @param {Object} params
 * @param {string} params.service Name of the service, for example, iam,
 *   user-id, leaderboard. This affects API's prefixes, as well as generated
 *   AWS-like SDK's ID.
 * @param {Array<API|Model|component>} params.components A list of
 *   components.
 * @param {object} [params.RegistratorCls=ComponentRegistrator] A subclass of
 *   ComponentRegistrator
 * @param {AwsC2jConfig} [params.awsC2j] Configures generated AWS SDK schema
 * @param {CookieConfig} [params.cookie] Configures fastify-cookie.
 * @param {HealthCheckConfig} [params.healthCheck] Configures health check endpoint.
 * @param {LatencyTrackerConfig} [params.latencyTracker]
 * @param {LoggingConfig} [params.logging] Configures logging.
 * @param {SwaggerConfig} [params.swagger] Configures swagger.
 * @returns {Promise<server>} fastify app with configured plugins
 */
async function makeApp (params = {}) {
  const configs = [
    [() => params, PARAMS_CONFIG],
    [() => params.awsC2j, AWS_C2J_CONFIG],
    [() => params.cookie, COOKIE_CONFIG],
    [() => params.healthCheck, HEALTH_CHECK_CONFIG],
    [() => params.latencyTracker, LATENCY_TRACKER_CONFIG],
    [() => params.logging, LOGGING_CONFIG],
    [() => params.swagger, SWAGGER_CONFIG]
  ]
  for (const [getter, defaultConfig] of configs) {
    loadConfigDefault(getter(), defaultConfig)
  }
  const {
    service,
    components,
    RegistratorCls,
    awsC2j,
    cookie,
    healthCheck,
    latencyTracker,
    logging,
    swagger
  } = params
  const app = fastify({
    ignoreTrailingSlash: true,
    disableRequestLogging: true,
    logger: makeLogger(logging.unittesting),
    ajv: {
      customOptions: {
        removeAdditional: false,
        allErrors: logging.reportAllErrors,
        useDefaults: true,
        strictSchema: false,
        strictRequired: true
      }
    }
  })

  const registrator = new RegistratorCls(app, service)

  app.register(cookiePlugin, { cookie })
    .register(compressPlugin)
    .register(contentParserPlugin)
    .register(latencyTrackerPlugin, { latencyTracker })
    .register(errorHandlerPlugin, {
      errorHandler: { returnErrorDetail: logging.reportErrorDetail }
    })
    .register(healthCheckPlugin, { healthCheck })
    .register(swaggerPlugin, { swagger })

  await registrator.registerComponents(components)

  app.register(awsPlugin, {
    awsC2j: {
      service,
      apis: registrator.apis,
      ...awsC2j
    }
  })

  return app
}

module.exports = makeApp
