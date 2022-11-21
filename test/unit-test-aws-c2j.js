const S = require('@pocketgems/schema')
const { BaseTest, runTests } = require('@pocketgems/unit-test')

const { BadRequestException, RequestDone } = require('..').EXCEPTIONS
const {
  C2JExporter,
  C2JShapeExporter,
  toStringID
} = require('../src/plugins/aws-c2j').__private

const { BaseAppTest } = require('./base-test')

class FakeAPI {
  constructor (arg) {
    Object.assign(this, arg)
  }

  getFullPath (service) {
    return `/fakeprefix/${service}${this.PATH}`
  }

  _getResponse () {
    let ret = this.RESPONSE
    if (!ret) {
      return ret
    }
    ret = ret.isTodeaSchema ? ret : S.obj(ret)
    return class extends RequestDone {
      static STATUS = 200
      static SCHEMA = ret
    }
  }

  _getErrors () {
    return this.ERRORS || {}
  }

  get _QUERY_STRING () {
    return this.QS
  }
}

class FakeShapeContainer {
  static addShape () { /* do nothing */ }
}

class C2JMetadataTest extends BaseTest {
  testCaching () {
    // Operations and shapes should be generated once.
    const API = new FakeAPI({
      name: 'A',
      PATH: '/aBc/:Aaac123/cc/:a1/:b2',
      METHOD: '112233'
    })
    API.BODY = {
      body1: S.str,
      body2: S.int
    }
    const exporter = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    })
    exporter.getC2J('api') // caches results

    const mock = jest.fn().mockImplementation(() => {})
    exporter.addShape = mock
    exporter.getC2J('api')
    expect(mock).toHaveBeenCalledTimes(0)
  }

  testInvalidType () {
    const exporter = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: []
    })
    expect(() => {
      exporter.getC2J('aaabbbccc')
    }).toThrow('Unsupported C2J type aaabbbccc')
  }

  testAPIVersion () {
    const apiVersion = 'some-version'
    const exp = new C2JExporter({
      id: '',
      name: '',
      version: apiVersion,
      description: '',
      apis: []
    })
    const api = exp.getC2J('api')
    expect(api.metadata.apiVersion).toBe(apiVersion)
  }

  testServiceName () {
    const exp = new C2JExporter(
      {
        id: 'titlebcd',
        name: 'TiTLe B-c// d',
        version: '',
        description: '',
        apis: []
      })
    const api = exp.getC2J('api')
    expect(api.metadata.serviceId).toBe('titlebcd')
    expect(api.metadata.endpointPrefix).toBe('titlebcd')
    expect(api.metadata.serviceFullName).toBe('TiTLe B-c// d Service')
    expect(api.metadata.serviceAbbreviation).toBe('TiTLeBcd')
  }

  testUID () {
    const name = 'TiTLe'
    const version = '23-11-AAA'
    const exp = new C2JExporter({
      id: name.toLowerCase(),
      name,
      version,
      description: '',
      apis: []
    })
    const api = exp.getC2J('api')
    expect(api.metadata.uid).toBe('title-23-11-aaa')
    expect(exp.getC2J('uid')).toBe(api.metadata.uid)
  }

  testConstants () {
    const exp = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [],
      globalEndpoint: 'example.com',
      signatureVersion: 'example'
    })
    const api = exp.getC2J('api')
    expect(api.metadata.protocol).toBe('rest-json')
    expect(api.metadata.globalEndpoint).toBe('example.com')
    expect(api.metadata.signatureVersion).toBe('example')
  }

  testUnsupported () {
    // For 100% coverage, and they shouldn't error out
    const exp = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: []
    })
    exp.getC2J('paginators')
    exp.getC2J('examples')
  }

  testExportMin () {
    const exporter = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: []
    })
    exporter.__normalC2J = () => require('./normal.json')
    expect(exporter.getC2J('min')).toEqual(require('./min.json'))
  }
}

class C2JOperationTest extends BaseTest {
  testNaming () {
    const API = new FakeAPI({
      name: 'AbCdEfgAPI',
      PATH: ''
    })
    const c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('normal')
    const opName = 'AbCdEfg'
    expect(Object.keys(c2j.operations)).toStrictEqual([opName])
    expect(c2j.operations[opName].name).toStrictEqual(opName)

    expect(() => {
      new C2JExporter({
        id: '',
        name: '',
        version: '',
        description: '',
        apis: [new FakeAPI({
          name: undefined,
          PATH: ''
        })]
      })
        .getC2J('normal')
    }).toThrow(/must have a name/)
  }

  testGlobalFields () {
    C2JShapeExporter.GLOBAL_HEADERS = ['x-uid', 'x-token', 'x-admin', 'x-app']
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: '/aBc/:Aaac123/cc/:a1/:b2',
      METHOD: '112233',
      HEADERS: S.obj({
        'x-token': S.str,
        'x-app': S.str,
        'x-uid': S.str,
        'x-admin': S.str,
        something: S.str
      }),
      BODY: S.obj({
        other: S.str
      })
    })
    const c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('normal')
    expect(c2j.shapes.XToken).toBeUndefined()
    expect(c2j.shapes.XUid).toBeUndefined()
    expect(c2j.shapes.XAdmin).toBeUndefined()
    expect(c2j.shapes.XApp).toBeUndefined()
    expect(c2j.shapes.Something).toBeDefined()
    C2JShapeExporter.GLOBAL_HEADERS = []
  }

  testHttpConvention () {
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: '/aBc/:Aaac123/cc/:a1/:b2',
      METHOD: '112233'
    })
    const c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('normal')
    const http = c2j.operations.A.http
    expect(http.method).toBe('112233')
    expect(http.requestUri).toBe('/fakeprefix//aBc/{Aaac123}/cc/{A1}/{B2}')
  }

  testInput () {
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: ''
    })
    let c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('normal')
    expect(c2j.operations.A.input).toBe(undefined)

    API.BODY = {
      body1: S.str,
      body2: S.int
    }
    API.PATH_PARAMS = { pp1: S.double }
    API.QS = { qs1: S.obj() }
    API.HEADERS = { friends: S.arr(S.str.title('Friend')) }

    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('normal')
    expect(c2j.operations.A.input).toStrictEqual({ shape: 'ARequest' })
    expect(c2j.shapes.ARequest).toStrictEqual({
      type: 'structure',
      members: {
        Pp1: {
          shape: 'Pp1',
          location: 'uri',
          locationName: 'pp1'
        },
        Qs1: {
          shape: 'Qs1',
          location: 'querystring',
          locationName: 'qs1'
        },
        Friends: {
          shape: 'FriendList',
          location: 'header',
          locationName: 'friends'
        },
        Payload: {
          shape: 'APayload'
        }
      },
      required: [
        'Friends',
        'Payload',
        'Pp1',
        'Qs1'
      ],
      payload: 'Payload'
    })
    expect(c2j.shapes.FriendList).toStrictEqual({
      type: 'list',
      member: { shape: 'Friend' }
    })
    expect(c2j.shapes.APayload).toStrictEqual({
      type: 'structure',
      members: {
        Body1: { shape: 'Body1', locationName: 'body1' },
        Body2: { shape: 'Body2', locationName: 'body2' }
      },
      required: ['Body1', 'Body2']
    })
  }

  testRequiredPayload () {
    // If anything in Payload is required, payload should be required.
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: ''
    })
    API.BODY = S.obj({
      body1: S.str.optional()
    })
    let c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('normal')
    expect(c2j.shapes.ARequest.required).toStrictEqual(undefined)

    API.BODY.prop('body2', S.str)
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('normal')
    expect(c2j.shapes.ARequest.required).toStrictEqual(['Payload'])
  }

  testOutput () {
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: '',
      RESPONSE: S.obj({ a: S.int })
    })
    const c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('api')
    expect(c2j.operations.A.output).toStrictEqual({ shape: 'AResponse' })
    expect(c2j.shapes.AResponse).toStrictEqual({
      type: 'structure',
      required: ['A'],
      members: {
        A: {
          locationName: 'a',
          shape: 'A'
        }
      }
    })
  }

  testInvalidOutput () {
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: '',
      RESPONSE: S.str
    })
    expect(() => {
      new C2JExporter({
        id: '',
        name: '',
        version: '',
        description: '',
        apis: [API]
      }).getC2J('api')
    }).toThrow('API A response must be object')
  }

  testNoOutput () {
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: '',
      RESPONSE: S.str.max(0)
    })
    const c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('api')
    expect(c2j.operations.A.output).toBe(undefined)
    expect(c2j.shapes.AResponse).toBe(undefined)
  }

  testMultipleResponses () {
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: '',
      RESPONSE: {
        a: S.int
      },
      ERRORS: {
        BadRequestException
      }
    })

    const c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('api')
    expect(c2j.operations.A.output).toStrictEqual({ shape: 'AResponse' })
    expect(c2j.operations.A.errors).toStrictEqual([
      { shape: 'BadRequestException' }
    ])
  }

  testDocumentation () {
    const API = new FakeAPI({
      name: 'AAPI',
      PATH: '',
      NAME: 'shortname',
      DESC: ['ddeesscc', 'aaa'],
      BODY: S.obj({
        AA: S.arr(S.str.desc('A string')).desc('An array'),
        b: S.obj({
          bb: S.int.desc('bbint')
        }).desc('bb desc')
      }).desc('BODY desc')
    })
    let c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: 'some  \n ddd',
      apis: [API]
    })
      .getC2J('normal')
    expect(c2j.operations.A.documentation).toBe('shortname ddeesscc aaa')
    expect(c2j.shapes.ARequest.members.Payload.documentation).toBe('BODY desc')
    expect(c2j.shapes.AAList.member.documentation).toBe('A string')
    expect(c2j.shapes.APayload.members.AA.documentation).toBe('An array')
    expect(c2j.shapes.APayload.members.B.documentation).toBe('bb desc')
    expect(c2j.shapes.B.members.Bb.documentation).toBe('bbint')
    expect(c2j.documentation)
      .toBe('some ddd')

    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: 'some  ddd',
      apis: [API]
    }).getC2J('api')
    expect(c2j.operations.A.documentation).toBe(undefined)
    expect(c2j.shapes.ARequest.members.Payload.documentation).toBe(undefined)
    expect(c2j.shapes.AAList.member.documentation).toBe(undefined)
    expect(c2j.shapes.APayload.members.AA.documentation).toBe(undefined)
    expect(c2j.shapes.APayload.members.B.documentation).toBe(undefined)
    expect(c2j.shapes.B.members.Bb.documentation).toBe(undefined)
    expect(c2j.documentation).toBe(undefined)

    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: 'some ddd',
      apis: [API]
    }).getC2J('docs')
    expect(c2j.operations.A).toBe('shortname ddeesscc aaa')
    expect(c2j.shapes.APayload.refs.ARequest$Payload).toBe('BODY desc')
    expect(c2j.shapes.AA.refs.AAList$member).toBe('A string')
    expect(c2j.shapes.AAList.refs.APayload$AA).toBe('An array')
    expect(c2j.shapes.B.refs.APayload$B).toBe('bb desc')
    expect(c2j.shapes.BBb.refs.B$Bb).toBe('bbint')
    expect(c2j.service)
      .toBe('some ddd')
  }

  testPaginators () {
    let API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: { nextToken: S.str, amount: S.str },
      RESPONSE: { nextToken: S.str, list: S.arr(S.str) }
    })
    let c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({
      pagination: {
        A: {
          input_token: 'NextToken',
          output_token: 'NextToken',
          limit_key: 'Amount',
          result_key: 'List'
        }
      }
    })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: { nextToken: S.str, amount: S.str }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      RESPONSE: { nextToken: S.str, list: S.arr(S.str) }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      BODY: { amount: S.str },
      RESPONSE: { nextToken: S.str, list: S.arr(S.str) }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: { nextToken: S.str },
      RESPONSE: { nextToken: S.str, list: S.arr(S.str) }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: { nextToken: S.str, amount: S.str },
      RESPONSE: { list: S.arr(S.str) }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: { nextToken: S.str, amount: S.str },
      RESPONSE: { nextToken: S.str }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: { nextToken: S.str, amount: S.str },
      RESPONSE: { nextToken: S.str, list: S.str }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: S.str,
      RESPONSE: { nextToken: S.str, list: S.str }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })

    API = new FakeAPI({
      name: 'AApi',
      PATH: '',
      QS: { nextToken: S.str, amount: S.str },
      RESPONSE: class extends RequestDone {
        static SCHEMA = S.str
      }
    })
    c2j = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: [API]
    }).getC2J('paginators')
    expect(c2j).toStrictEqual({ pagination: {} })
  }
}

class C2JShapeTest extends BaseTest {
  setUp () {
    this.exp = new C2JExporter({
      id: '',
      name: '',
      version: '',
      description: '',
      apis: []
    })
  }

  testStringID () {
    expect(toStringID('abc')).toBe('Abc')
    expect(toStringID('ab c-a_b12c')).toBe('AbCAB12c')
    expect(toStringID('a-b12-aa ff')).toBe('AB12AaFf')
    expect(toStringID('alpha (bravo) char')).toBe('AlphaBravoChar')
  }

  testDupShape () {
    // Two identical shapes with the same name should be ok.
    const apis = [
      new FakeAPI({
        name: 'AApi',
        PATH: '',
        QS: S.obj().prop('a', S.int)
      }),
      new FakeAPI({
        name: 'BApi',
        PATH: '',
        QS: S.obj().prop('a', S.int)
      })
    ]
    expect(() => {
      new C2JExporter({
        id: '',
        name: '',
        version: '',
        description: '',
        apis
      }).getC2J('normal')
    }).not.toThrow()

    // Two different shapes with the same name is not
    apis.push(new FakeAPI({
      name: 'CApi',
      PATH: '',
      HEADERS: S.obj().prop('a', S.double)
    }))
    expect(() => {
      new C2JExporter({
        id: '',
        name: '',
        version: '',
        description: '',
        apis
      }).getC2J('normal')
    }).toThrow()
  }

  testPrefix () {
    const exporter = new C2JShapeExporter({
      defaultName: 'AbC',
      container: FakeShapeContainer
    })
    const { retShape } = S.obj().prop('bb', S.str).export(exporter)
    expect(retShape).toStrictEqual({
      type: 'structure',
      members: {
        Bb: {
          shape: 'AbCBb',
          locationName: 'bb'
        }
      },
      required: ['Bb']
    })
  }

  testStringShape () {
    const exporter = new C2JShapeExporter({
      container: FakeShapeContainer
    })
    const { retShape } = S.str
      .min(1)
      .max(2)
      .pattern(/^[a-zA-Z]+/)
      .enum('a', 'b')
      .export(exporter)
    expect(retShape).toStrictEqual({
      type: 'string',
      min: 1,
      max: 2,
      pattern: '^[a-zA-Z]+$',
      enum: ['a', 'b']
    })
  }

  testObjectShape () {
    const exporter = new C2JShapeExporter({
      defaultName: '',
      container: FakeShapeContainer
    })
    const { retShape } = S.obj()
      .prop('a', S.str)
      .export(exporter)
    expect(retShape).toStrictEqual({
      type: 'structure',
      members: {
        A: {
          shape: 'A',
          locationName: 'a'
        }
      },
      required: ['A']
    })
  }

  testPatternObject () {
    const exporter = new C2JShapeExporter({
      defaultName: '',
      container: FakeShapeContainer
    })
    expect(() => {
      // pattern obj example start
      S.obj().patternProps({ 'xyz-.*': S.str })
      // pattern obj example end
        .export(exporter)
    }).toThrow('C2J schema does not support pattern properties.')
  }

  testArrayObject () {
    const exporter = new C2JShapeExporter({
      defaultName: 'AcbErf',
      container: FakeShapeContainer
    })
    const { retShape } = S.arr()
      .items(S.str)
      .min(1)
      .max(2)
      .export(exporter)
    expect(retShape).toStrictEqual({
      type: 'list',
      member: { shape: 'AcbErf' },
      min: 1,
      max: 2
    })

    expect(() => {
      S.obj({
        items: S.arr(S.str)
      })
        .export(exporter)
    }).toThrow(/must take singular form/)
  }

  testIntegerObject () {
    const exporter = new C2JShapeExporter({
      container: FakeShapeContainer
    })
    const { retShape } = S.int
      .min(1)
      .max(2)
      .export(exporter)
    expect(retShape).toStrictEqual({
      type: 'integer',
      min: 1,
      max: 2
    })
  }

  testLongConversion () {
    const exporter = new C2JShapeExporter({
      container: FakeShapeContainer
    })

    // verify defined min is used
    let result = S.int
      .min(S.INT64_MAX)
      .export(exporter)

    expect(result.retShape)
      .toEqual(
        expect.objectContaining({
          type: 'long'
        }))

    result = S.int
      .min(S.INT64_MIN)
      .export(exporter)
    expect(result.retShape)
      .toEqual(
        expect.objectContaining({
          type: 'long'
        }))

    // verify defined max is used
    result = S.int
      .max(S.INT64_MAX)
      .export(exporter)

    expect(result.retShape)
      .toEqual(
        expect.objectContaining({
          type: 'long'
        }))
    result = S.int
      .max(S.INT64_MIN)
      .export(exporter)

    expect(result.retShape)
      .toEqual(
        expect.objectContaining({
          type: 'long'
        }))

    // verify greater of max/min is used
    result = S.int
      .max(S.INT64_MAX)
      .min(-23)
      .export(exporter)
    expect(result.retShape)
      .toEqual(
        expect.objectContaining({
          type: 'long'
        }))

    result = S.int
      .max(23)
      .min(S.INT64_MIN)
      .export(exporter)
    expect(result.retShape)
      .toEqual(
        expect.objectContaining({
          type: 'long'
        }))

    // verify if both min/max are within bounds, int is used
    result = S.int
      .max(S.INT32_MAX)
      .min(S.INT32_MAX)
      .export(exporter)
    expect(result.retShape)
      .toEqual(
        expect.objectContaining({
          type: 'integer'
        }))

    // if max is out of bounds for INT64, throw exception
    let badSchema = S.int
      .max(Math.pow(2, 64))
    expect(() => badSchema.export(exporter)).toThrow()

    badSchema = S.int
      .max(-Math.pow(2, 64))
    expect(() => badSchema.export(exporter)).toThrow()

    // if min is out of bounds for INT64, throw exception
    badSchema = S.int
      .min(Math.pow(2, 64))
    expect(() => badSchema.export(exporter)).toThrow()
    badSchema = S.int
      .min(-Math.pow(2, 64))
    expect(() => badSchema.export(exporter)).toThrow()
  }

  testNumberObject () {
    const exporter = new C2JShapeExporter({
      container: FakeShapeContainer
    })
    const { retShape } = S.double
      .min(1)
      .max(2)
      .export(exporter)
    expect(retShape).toStrictEqual({
      type: 'double',
      min: 1,
      max: 2
    })
  }

  testFloatObject () {
    const exporter = new C2JShapeExporter({
      container: FakeShapeContainer
    })
    const { retShape } = S.double
      .min(1)
      .max(2)
      .asFloat()
      .export(exporter)
    expect(retShape).toEqual(expect.objectContaining({
      type: 'float'
    }))
  }

  testMapObject () {
    const exporter = new C2JShapeExporter({
      defaultName: 'abc123',
      container: FakeShapeContainer
    })
    const { retShape } = S.map
      .min(1)
      .max(2)
      .keyPattern('abc*')
      .value(S.bool.desc('desc 1233'))
      .export(exporter)
    expect(retShape).toStrictEqual({
      type: 'map',
      min: 1,
      max: 2,
      key: {
        shape: 'Abc123Key',
        locationName: 'key'
      },
      value: {
        shape: 'Abc123Value',
        locationName: 'value',
        documentation: 'desc 1233'
      }
    })
  }

  testMediaObject () {
    const exporter = new C2JShapeExporter({
      defaultName: 'abc123',
      container: FakeShapeContainer
    })
    const retShape = S.media
      .type('application/zip')
      .encoding('base64')
      .export(exporter)
      .retShape
    expect(retShape).toStrictEqual({
      type: 'blob'
    })

    const retShape2 = S.media
      .type('application/zip')
      .export(exporter)
      .retShape
    expect(retShape2).toStrictEqual({
      type: 'string'
    })
  }

  testAddToContainerFlag () {
    let count = 0
    const container = {
      addShape: () => {
        count++
      }
    }

    const exporter = new C2JShapeExporter({
      addToContainer: false,
      container: container,
      defaultName: 'Bb'
    })
    S.obj({
      a: S.int
    }).export(exporter)

    expect(count).toBe(1) // a: S.int

    S.arr(S.int).export(exporter)

    expect(count).toBe(2) // S.int

    S.map.value(S.int).export(exporter)
    expect(count).toBe(4) // key & value

    S.str.export(exporter)
    expect(count).toBe(4)
  }

  testAddShapeOrder () {
    // Schema subclasses sometimes have additional modifications to the shape.
    // If we add the shape then make changes, a repeated shape with the same
    // name would be different from the one already added, thus cause an error.
    // Make sure Array, Object and Map don't cause problems.
    let count = 0
    const tempContainer = {
      expected: undefined,
      name: undefined,
      addShape: function (name, shape) {
        if (this.name === name) {
          expect(shape).toStrictEqual(this.expected)
          count++
        }
      }
    }

    tempContainer.name = 'Bb'
    tempContainer.expected = {
      type: 'structure',
      members: {
        A: {
          shape: 'BbA',
          locationName: 'a'
        }
      },
      required: ['A']
    }
    const exporter = new C2JShapeExporter({
      defaultName: 'Bb',
      container: tempContainer
    })
    S.obj({
      a: S.int
    }).export(exporter)

    tempContainer.name = 'BbList'
    tempContainer.expected = {
      type: 'list',
      member: {
        shape: 'Bb'
      }
    }
    S.arr(S.int).export(exporter)

    tempContainer.name = 'Bb'
    tempContainer.expected = {
      type: 'map',
      key: {
        shape: 'BbKey',
        locationName: 'key'
      },
      value: {
        shape: 'BbValue',
        locationName: 'value'
      }
    }
    S.map
      .value(S.int)
      .export(exporter)

    tempContainer.name = 'Bb'
    tempContainer.expected = {
      type: 'string',
      pattern: '^abc$' // anchors should get added
    }
    S.str
      .pattern('abc')
      .export(exporter)
    // Make sure expect happened for each type.
    expect(count).toBe(4)
  }

  testTitleOverwritesName () {
    let exporter = new C2JShapeExporter({
      defaultName: '123',
      container: {
        addShape: (name) => {
          expect(name).toBe('Something')
          count++
        }
      }
    })

    let count = 0
    const { retName } = S.int.title('Something').export(exporter)
    expect(retName).toBe('Something')
    expect(count).toBe(1)

    // Inner object's title is reflected on the array
    exporter = new C2JShapeExporter({
      defaultName: '123',
      container: {
        addShape: (name) => {
          names.push(name)
        }
      }
    })
    const names = []
    const ret = S.arr(S.obj().title('ABC')).export(exporter)
    expect(ret.retName).toBe('ABCList')
    expect(names).toStrictEqual(['ABC', 'ABCList'])

    // Array title takes precedence over using inner object's title as prefix
    exporter = new C2JShapeExporter({
      defaultName: '123',
      container: {
        addShape: (name) => {
          names1.push(name)
        }
      }
    })
    const names1 = []
    const ret1 = S.arr(S.obj().title('ABC')).title('SomeList').export(exporter)
    expect(ret1.retName).toBe('SomeList')
    expect(names1).toStrictEqual(['ABC', 'SomeList'])
  }
}

class C2JAPITest extends BaseAppTest {
  async testC2JSchema () {
    await this.app.get('/unittest/c2j/user/api')
      .expect(200)
    await this.app.get('/unittest/c2j/user/api')
      .expect(200)
    await this.app.get('/unittest/c2j/admin/api')
      .expect(200)
    await this.app.get('/unittest/c2j/admin/api')
      .expect(200)
  }
}

runTests(C2JMetadataTest, C2JOperationTest, C2JShapeTest, C2JAPITest)
