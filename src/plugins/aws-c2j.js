const assert = require('assert')

const S = require('@pocketgems/schema')
const deepEqual = require('fast-deep-equal')
const fp = require('fastify-plugin')
const deepCopy = require('rfdc')()

/**
 * Any non alphanumerical characters are stripped, the immediate next character
 * is capitalized.
 * @param {String} str
 * @return A string ID, AKA an upper camel case string.
 */
function toStringID (str) {
  if (!str || str.length === 0) {
    return str
  }
  return str.split(/[^a-zA-Z0-9]/).map(s => {
    return s.replace(/^./, (s[0] || '').toUpperCase())
  }).join('')
}

class InputSchemaMerger {
  constructor (container, opName) {
    this.opName = opName
    this.container = container
    const exporter = new C2JShapeExporter({ addToContainer: false })
    const { retShape } = S.obj().export(exporter)
    this.__shape = retShape
  }

  /**
   * Merges C2J shape from schema into existing input shape.
   * @param {TodeaSchema} schema A schema
   * @param {String} location Where the members of the C2J shape goes, e.g.
   *   header or query.
   */
  mergeSchema (schema, location) {
    const exporter = new C2JShapeExporter({
      addToContainer: false,
      container: this.container,
      defaultName: '',
      location
    })
    const { retShape } = schema.export(exporter)

    const required = [
      ...(this.__shape.required || []),
      ...(retShape.required || [])
    ]
    if (required.length !== 0) {
      // Keep required sorted, it looks nicer.
      required.sort()
      this.__shape.required = required
    }
    Object.assign(this.__shape.members, retShape.members)
  }

  /**
   * Adds a payload / body schema to the input shape.
   * @param {TodeaSchema} schema A body schema.
   */
  addPayloadSchema (schema) {
    schema = schema.isTodeaSchema ? schema : S.obj(schema)
    const bodyPropName = 'Payload'
    const bodyShapeName = this.opName + bodyPropName
    const exporter = new C2JShapeExporter({
      addToContainer: false,
      container: this.container,
      defaultName: ''
    })
    const { retShape, retDoc } = schema.export(exporter)
    this.container.addShape(bodyShapeName, retShape)

    const bodyShapeDesc = { shape: bodyShapeName }
    if (retDoc) {
      bodyShapeDesc.documentation = retDoc
    }
    this.__shape.members[bodyPropName] = bodyShapeDesc
    this.__shape.payload = bodyPropName
    if (retShape.required && retShape.required.length !== 0) {
      const req = this.__shape.required || []
      req.push(bodyPropName)
      req.sort()
      this.__shape.required = req
    }
  }

  /**
   * @return The input shape if there are any, else undefined.
   */
  inputShape () {
    if (this.__shape.members &&
        Object.keys(this.__shape.members).length !== 0) {
      return this.__shape
    }
    return undefined
  }
}

/**
 * Exporter for Todea schema objects. It is the visitor in the visitor pattern.
 */
class C2JShapeExporter {
  /*
   * Derives a name for the generated shape schema based on the 'title'
   * property then fallback to defaultName. Nested schema uses the current
   * shape schema name as prefix / scope. Adds the current shape schema to the
   * container if requested. Nested shape schemas are always added to the
   * container.
   *
   * @param {Object} params
   * @param {Object} [params.defaultName] A tentative name for the shape, if
   *   it is added to the container. Also a prefix for nested shapes
   * @param {String} [params.addToContainer=true] If the shape schema should
   *   be added to the container. Nested shapes will always be added to the
   *   container.
   * @param {ContainerObject} params.container A container object that
   *   implements addShape(name, shapeSchema)
   * @param {String} [params.location] The location for the schema, e.g.
   *   header, queryString, etc...
   */
  constructor ({
    addToContainer = true,
    container,
    defaultName = '',
    location
  }) {
    this.addToContainer = addToContainer
    this.container = container
    this.defaultName = defaultName
    this.location = location
  }

  __getRange (schema) {
    return {
      max: schema.getProp(schema.constructor.MAX_PROP_NAME),
      min: schema.getProp(schema.constructor.MIN_PROP_NAME)
    }
  }

  __exportDefault (schema, type) {
    const ret = { type }

    const { max, min } = this.__getRange(schema)
    if (max !== undefined) {
      ret.max = max
    }
    if (min !== undefined) {
      ret.min = min
    }

    const name = toStringID(
      schema.getProp('title') || this.defaultName)
    this.__tryAddToContainer(name, ret)
    return {
      retName: name,
      retShape: ret,
      retDoc: schema.getProp('description')
    }
  }

  // Check to see if shape needs to be added to container
  __tryAddToContainer (name, shape) {
    if (this.addToContainer) {
      this.container.addShape(name, shape)
    }
  }

  /**
   * @typedef {Object} C2JSchemaReturnValue
   * @property {String} retName The actual name used for the shape schema
   * @property {Object} retShape The shape schema
   * @property {String} retDoc The documentation / description for the shape
   *   schema
   */

  exportString (schema) {
    const baseExporter = new C2JShapeExporter({
      addToContainer: false, // Don't add yet, members and required not setup.
      container: this.container,
      defaultName: this.defaultName
    })
    const ret = baseExporter.__exportDefault(schema, 'string')
    for (const prop of ['pattern', 'enum']) {
      const val = schema.getProp(prop)
      if (val) {
        ret.retShape[prop] = val
      }
    }
    this.__tryAddToContainer(ret.retName, ret.retShape)
    return ret
  }

  exportInteger (schema) {
    const { max, min } = this.__getRange(schema)
    if (max === undefined && min === undefined) {
      // TODO make default into 'long'
      return this.__exportDefault(schema, 'integer')
    }

    // set to default to test the given input params
    const trueMax = max ?? min
    const trueMin = min ?? max
    if (trueMax > S.INT64_MAX || trueMin < S.INT64_MIN) {
      throw new Error(
        `max and min must be between ${S.INT64_MIN} ${S.INT64_MAX}`
      )
    }

    if (trueMax > S.INT32_MAX || trueMin < S.INT32_MIN) {
      // TODO once default is 'long'
      // flip to only check max < S.INT32_MAX
      return this.__exportDefault(schema, 'long')
    }
    return this.__exportDefault(schema, 'integer')
  }

  exportNumber (schema) {
    if (schema.getProp('isFloat')) {
      return this.__exportDefault(schema, 'float')
    }
    return this.__exportDefault(schema, 'double')
  }

  exportObject (schema) {
    assert(Object.keys(schema.patternSchemas).length === 0,
      'C2J schema does not support pattern properties.')
    const baseExporter = new C2JShapeExporter({
      addToContainer: false, // Don't add yet, members and required not setup.
      container: this.container,
      defaultName: this.defaultName
    })
    const { retName, retShape, retDoc } =
      baseExporter.__exportDefault(schema, 'structure')
    const members = {}
    const required = []

    for (const [name, p] of Object.entries(schema.objectSchemas)) {
      if (this.constructor.GLOBAL_HEADERS?.includes(name)) {
        continue
      }
      const camelName = toStringID(name)
      const exporter = new C2JShapeExporter({
        container: this.container,
        defaultName: retName + camelName
      })
      const ret = p.export(exporter)
      const shapeName = ret.retName
      const shapeDoc = ret.retDoc
      if (p.required) {
        required.push(camelName)
      }
      const shapeSpec = {
        shape: shapeName,
        locationName: name
      }
      if (this.location) {
        shapeSpec.location = this.location
      }
      if (shapeDoc) {
        shapeSpec.documentation = shapeDoc
      }
      members[camelName] = shapeSpec
    }

    retShape.members = members
    if (required.length !== 0) {
      retShape.required = required
    }

    this.__tryAddToContainer(retName, retShape)
    return { retName, retShape, retDoc }
  }

  exportArray (schema) {
    const itemsExporter = new C2JShapeExporter({
      defaultName: this.defaultName,
      container: this.container
    })
    const ret = schema.itemsSchema.export(itemsExporter)

    const baseExporter = new C2JShapeExporter({
      defaultName: ret.retName + 'List',
      container: this.container,
      addToContainer: false // Don't add yet, since member is not setup.
    })
    const { retName, retShape, retDoc } = baseExporter.__exportDefault(schema,
      'list')
    if (retName.endsWith('sList')) {
      throw new Error(
        `${retName} must take singular form.
        This error occurs on array schemas like this:
        S.arr( S.str )
        You must name the item schema like this:
        S.arr( S.str.title("Key") )
        which will give the array schema a default name "KeyList".`
      )
    }

    const shapeName = ret.retName
    const shapeDoc = ret.retDoc
    const shapeSpec = { shape: shapeName }
    if (retDoc) {
      shapeSpec.documentation = shapeDoc
    }

    retShape.member = shapeSpec
    this.__tryAddToContainer(retName, retShape)
    return { retName, retShape, retDoc }
  }

  exportBoolean (schema) {
    return this.__exportDefault(schema, 'boolean')
  }

  exportMap (schema) {
    // To C2J MapSchema is just map, no Array of Objects. Here we bypass super
    // and go directly to BaseSchema for common functionalities.
    const baseExporter = new C2JShapeExporter({
      defaultName: this.defaultName,
      container: this.container,
      addToContainer: false
    })
    const { retName, retShape, retDoc } = baseExporter.__exportDefault(schema,
      'map')
    for (const propName of ['key', 'value']) {
      const propDefaultName = this.defaultName +
      toStringID(propName)
      const exporter = new C2JShapeExporter({
        defaultName: propDefaultName,
        container: this.container
      })
      const ret = schema[`${propName}Schema`].export(exporter)
      const shapeName = ret.retName
      const shapeDoc = ret.retDoc
      const shapeSpec = {
        shape: shapeName,
        locationName: propName
      }
      if (shapeDoc) {
        shapeSpec.documentation = shapeDoc
      }
      retShape[propName] = shapeSpec
    }
    this.__tryAddToContainer(retName, retShape)
    return { retName, retShape, retDoc }
  }

  exportMedia (schema) {
    const baseExporter = new C2JShapeExporter({
      defaultName: this.defaultName,
      container: this.container,
      addToContainer: false
    })
    const { retName, retShape, retDoc } = baseExporter.__exportDefault(schema,
      'string')
    const encoding = schema.getProp('contentEncoding')
    if (encoding) {
      retShape.type = 'blob'
    }
    this.__tryAddToContainer(retName, retShape)
    return { retName, retShape, retDoc }
  }
}

/**
 * Parses Todea APIs and emits AWS's C2J schema files.
 */
class C2JExporter {
  constructor ({
    id, name, version, description, apis, signatureVersion, globalEndpoint
  }) {
    this.apis = apis
    const compactName = name.replace(/[^a-zA-Z0-9]/g, '')
    // istanbul ignore if
    if (id !== compactName.toLowerCase()) {
      throw new Error(`Lowercase name ${name} without spaces or ` +
        `non-alphanumeric characters must match the id ${id}.`)
    }
    const lowerCaseVersion = version.toLowerCase()
    this.metadata = {
      serviceId: id,
      serviceFullName: name + ' Service',
      serviceAbbreviation: compactName,
      endpointPrefix: id,
      globalEndpoint,
      uid: [id, lowerCaseVersion].join('-'),
      apiVersion: version,
      protocol: 'rest-json',
      signatureVersion
    }
    const desc = description
      .replace(/(\r\n|\n|\r)/gm, ' ') // Make newlines spaces
      .replace(/(\s+)/gm, ' ') // Remove extra spaces
    this.documentation = desc
    this.operations = {}
    this.shapes = {}
  }

  /**
   * Adds a shape in the shapes section. Checks for duplicates with the same
   * name first. If pre-existing shape differs from the current shape in any
   * way, an exception is thrown.
   * @param {String} name The name of the shape.
   * @param {Object} shape An object describing the shape.
   */
  addShape (name, shape) {
    if (this.shapes[name] && !deepEqual(this.shapes[name], shape)) {
      console.error(this.shapes[name], shape)
      throw new Error(`Two different shapes have the same name (${name}): ` +
        'maybe you can use title() to differentiate them')
    }
    this.shapes[name] = shape
  }

  /**
   * Processes APIs, cache results in operations and shapes.
   */
  processAPIs () {
    if (Object.keys(this.operations).length !== 0) {
      return
    }
    for (const api of this.apis) {
      // remove 'API' ignoring case
      assert(Object.prototype.hasOwnProperty.call(api, 'name') && api.name &&
        api.name.length !== 0, `API ${api} must have a name`)
      assert(api.name.substring(0, 1).match(/[A-Z]/),
        `Operation name ${api.name} must start with a capital letter`)
      const opName = api.name.match(/^.*api$/i)
        ? api.name.substring(0, api.name.length - 3)
        : api.name
      const operation = {
        name: opName,
        http: {
          method: api.METHOD,
          requestUri: api.getFullPath(this.metadata.serviceId)
            .split('/').map(c => {
              if (c.startsWith(':')) {
                // remove ':' and capitalize first letter
                const qsName = c.charAt(1).toUpperCase() + c.slice(2)
                return `{${qsName}}`
              }
              return c
            })
            .join('/')
        }
      }

      const desc = Array.isArray(api.DESC) ? api.DESC.join(' ') : api.DESC
      operation.documentation = [
        api.NAME,
        desc || ''
      ].join(' ')

      try {
        this.__parseInputSchema({ operation, api })
        this.__parseOutputSchema({ operation, api })
      } catch (e) {
        console.error(`failed to parse API ${api.name}`)
        throw e
      }

      this.operations[opName] = operation
    }
  }

  /**
   * Parses API to populate operation's input field.
   *
   * @param {Object} params
   * @param {APIObject} params.api An API object
   * @param {String} params.operation The operation
   */
  __parseInputSchema ({ api, operation }) {
    const opName = operation.name
    const inputSchemaMerger = new InputSchemaMerger(this, opName)
    const inputFields = {
      HEADERS: 'header',
      _QUERY_STRING: 'querystring',
      PATH_PARAMS: 'uri'
    }
    for (const [field, location] of Object.entries(inputFields)) {
      const schema = api[field]
      if (!schema) {
        continue
      }
      inputSchemaMerger.mergeSchema(
        schema.isTodeaSchema ? schema : S.obj(schema),
        location
      )
    }

    const body = api.BODY
    if (body) {
      inputSchemaMerger.addPayloadSchema(body)
    }

    const input = inputSchemaMerger.inputShape()
    if (input) {
      const inputName = opName + 'Request'
      operation.input = { shape: inputName }
      this.addShape(inputName, input)
    }
  }

  /**
   * Parses API to populate operation's output field.
   *
   * @param {Object} params
   * @param {APIObject} params.api An API object
   * @param {String} params.operation The operation
   */
  __parseOutputSchema ({ api, operation }) {
    const opName = operation.name
    const outputName = opName + 'Response'
    const response = api._getResponse()

    if (response) {
      operation.http.responseCode = response.httpCode
      const exporter = new C2JShapeExporter({
        addToContainer: false,
        container: this,
        defaultName: ''
      })
      const { retShape } = response.schema.export(exporter)
      if (['string', 'array', 'object'].includes(retShape.type) &&
        retShape.max === 0) {
        return
      } else {
        if (retShape.type !== 'structure') {
          throw new Error(`API ${operation.name} response must be object`)
        }
        operation.output = { shape: outputName }
        this.addShape(outputName, retShape)
      }
    }

    operation.errors = []
    for (const error of Object.values(api._getErrors())) {
      const statusCode = error.STATUS
      const shapeName = error.name

      const exporter = new C2JShapeExporter({
        addToContainer: false,
        container: this,
        defaultName: shapeName
      })
      const { retShape } = error.c2jSchema.export(exporter)
      operation.errors.push({ shape: shapeName })
      retShape.error = { httpStatusCode: statusCode }
      retShape.exception = true
      this.addShape(shapeName, retShape)
    }
  }

  /**
   * Return deep copy of C2J schema.
   */
  __normalC2J () {
    return {
      version: '2.0',
      documentation: this.documentation,
      metadata: deepCopy(this.metadata),
      operations: deepCopy(this.operations),
      shapes: deepCopy(this.shapes)
    }
  }

  /**
   * Normal C2J minus documentations
   */
  __apiC2J () {
    const ret = this.__normalC2J()
    delete ret.documentation

    for (const op of Object.values(ret.operations)) {
      delete op.documentation
    }
    for (const shape of Object.values(ret.shapes)) {
      delete shape.documentation

      const members = shape.members || {}
      for (const m of Object.values(members)) {
        delete m.documentation
      }

      const member = shape.member || {}
      delete member.documentation
    }
    return ret
  }

  /**
   * Collapsing documentations from normal C2J, builds reverse dependencies
   */
  __docsC2J () {
    const c2j = this.__normalC2J()
    const ret = {
      version: c2j.version,
      service: c2j.documentation,
      operations: {},
      shapes: {}
    }
    const retOps = ret.operations
    for (const op of Object.values(c2j.operations)) {
      retOps[op.name] = op.documentation
    }

    const retShapes = ret.shapes
    for (const name of Object.keys(c2j.shapes)) {
      retShapes[name] = {
        base: null,
        refs: {}
      }
    }

    for (const [sName, shape] of Object.entries(c2j.shapes)) {
      const retShape = retShapes[sName]
      retShape.base = shape.documentation || null

      const members = shape.members || {}
      for (const [mName, member] of Object.entries(members)) {
        const refName = [sName, mName].join('$')
        retShapes[member.shape].refs[refName] = member.documentation
      }

      const member = shape.member
      if (member) {
        const refName = [sName, 'member'].join('$')
        retShapes[member.shape].refs[refName] = member.documentation
      }
    }
    return ret
  }

  __paginatorsC2J () {
    const c2j = this.__normalC2J()
    const ret = {}
    for (const operation of Object.values(c2j.operations)) {
      if (!operation.input || !operation.output) {
        continue
      }
      const requestShape = c2j.shapes[operation.input.shape]
      if (!requestShape.members.NextToken) {
        continue
      }

      if (!requestShape.members.Amount) {
        continue
      }

      const responseShape = c2j.shapes[operation.output.shape]
      const outputs = responseShape.members
      if (!outputs.NextToken) {
        continue
      }

      const retKey = Object.keys(outputs).filter(k => k !== 'NextToken')[0]
      if (!retKey) {
        continue
      }
      const retShape = c2j.shapes[outputs[retKey].shape]
      if (retShape.type !== 'list') {
        continue
      }
      ret[operation.name] = {
        input_token: 'NextToken',
        output_token: 'NextToken',
        limit_key: 'Amount',
        result_key: retKey
      }
    }
    return {
      pagination: ret
    }
  }

  __examplesC2J () {
    // TODO: Support examples
    return {
      version: '1.0',
      examples: {}
    }
  }

  /**
   * @return The UID of C2J schema.
   */
  __uidC2J () {
    // Somewhat hacky, just return the UID of the C2J.
    return this.metadata.uid
  }

  /**
   * Returns a C2J schema of specified type.
   * @param {'uid'|'normal'|'api'|'docs'} type The type of the C2J schema.
   */
  getC2J (type) {
    this.processAPIs()
    const getter = this['__' + type + 'C2J']
    if (!getter) {
      throw new Error('Unsupported C2J type ' + type)
    }
    return getter.call(this)
  }
}

/**
 * The fastify plug-in interface.
 *
 * @param {Fastify} fastify A fastify instance.
 * @param {Object} opts Options
 * @param {string} opts.service Lower case ID for the SDK, also constructs
 *   SDK schema paths like `/[service]/[path]/:group/:type
 * @param {string} [opts.path='/c2j'] Constructs path `/[service]/[path]/:group/:type
 * @param {string} opts.displayName A UpperCamelCased name for the API.
 * @param {string} opts.version A date string of when the API is released.
 *   For example, '2020-09-20'.
 * @param {string} opts.displayName A UpperCamelCased name for the API.
 * @param {string} opts.signatureVersion AWS SDK signature version, e.g. v4
 * @param {string} opts.globalEndpoint Global endpoint
 * @param {string} opts.globalHeaders A list of header keys to skip as API
 *   input, these inputs will be provided at SDK level, e.g. ACCESS_KEY_ID, or
 *   SECRET_ACCESS_KEY in vanilla AWS SDK. You can also make your own
 *   customizations
 * @param {Array<TodeaAPI>} opts.apis A list of Todea APIs.
 * @param {Function} next A callback to signal plug-in installation completion.
 */
function c2jExporter (fastify, opts, next) {
  // istanbul ignore if
  if (opts.awsC2j.disabled) {
    next()
    return
  }

  const {
    service,
    path,
    displayName,
    version,
    signatureVersion,
    globalEndpoint,
    globalHeaders,
    apis
  } = opts.awsC2j
  for (const api of apis) {
    // istanbul ignore if
    if (!['user', 'admin', 'service', null].includes(api.SDK_GROUP)) {
      throw new Error(`Invalid SDK_GROUP value ${api.SDK_GROUP} for ${api}`)
    }
  }
  C2JShapeExporter.GLOBAL_HEADERS = globalHeaders
  const exporterArgs = {
    id: service,
    name: displayName,
    version,
    description: '',
    signatureVersion,
    globalEndpoint
  }
  const exporters = {
    user: new C2JExporter({
      ...exporterArgs,
      apis: apis.filter(api => api.SDK_GROUP === 'user')
    }),
    admin: new C2JExporter({
      ...exporterArgs,
      apis: apis.filter(api => ['user', 'admin'].includes(api.SDK_GROUP))
    }),
    service: new C2JExporter({
      ...exporterArgs,
      apis: apis.filter(api => api.SDK_GROUP !== null)
    })
  }
  fastify.get(
    `/${service}${path}/:sdkGroup/:type`,
    { schema: { hide: true } },
    async (req, reply) => {
      const exporter = exporters[req.params.sdkGroup]
      const c2j = exporter.getC2J(req.params.type)
      /* istanbul ignore else */
      if (exporter.operations &&
          Object.keys(exporter.operations).length !== 0) {
        /* istanbul ignore else */
        if (typeof c2j !== 'string') {
          reply.type('application/json')
        }
        reply.send(c2j)
      } else {
        reply.send('')
      }
    }
  )
  next()
}

module.exports = fp(c2jExporter, {
  fastify: '>=3.x',
  name: 'aws-c2j'
})

// istanbul ignore else
if (process.env.NODE_ENV === 'localhost') {
  module.exports.__private = {
    C2JExporter,
    C2JShapeExporter,
    toStringID
  }
}
