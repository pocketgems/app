# Todea App Library <!-- omit in toc -->
Todea App library is a backend framework designed to streamline Node.js
development workflow for your side project, then seamlessly transition to
enterprise scale applications supporting millions of users.

## Topics <!-- omit in toc -->
- [Key Features](#key-features)
- [Getting Started](#getting-started)
  - [Creating A Database Table](#creating-a-database-table)
  - [Creating An API](#creating-an-api)
  - [Creating An App](#creating-an-app)
- [Components](#components)
  - [Customizing Component Registration](#customizing-component-registration)
- [Unit testing](#unit-testing)
  - [Setup](#setup)
  - [Writing Tests](#writing-tests)
- [Generating SDKs](#generating-sdks)
  - [Swagger UI](#swagger-ui)
  - [OpenAPI SDKs](#openapi-sdks)
  - [AWS SDKs](#aws-sdks)

# Key Features
- High level [DB library](https://www.npmjs.com/package/@pocketgems/dynamodb)
  - For AWS DyanmoDB
  - Schemaful
  - Transactional
  - Scalable
  - Lighting fast
  - Support DAX, Index, Query, Scan and more
- High level [API library](docs/libs/api.md)
  - Routing
  - Input, output schema
  - Exceptions
  - CORS
  - Authentication
  - Compression
  - Health check API
  - Advanced error handling
- SDK Generation
  - Swagger UI
  - OpenAPI SDK
  - AWS SDK & CLI compatible

# Getting Started
With Todea App library, you can define database schemas, create several APIs,
and have a procedurally generated SDK ready for client and frontend consumption
within hours.

## Creating A Database Table
You can create a database table with a few lines of code:
```js
const db = require('@pocketgems/dynamodb')
const S = require('@pocketgems/schema')

class Order extends db.Model {
  static KEY = {
    id: S.str.min(10).desc(`A unique string id for the order.
      ID must be at least 10 characters long`)
  }

  static FIELDS = {
    customerId: S.str,
    items: S.map.value(S.obj({
      itemId: S.str.desc('An item\'s ID'),
      quantity: S.int.min(1),
      dollarPrice: S.double.min(1)
    }))
  }
}
```

The example above defines a db table called `Order` to store customers orders.
Each order can have one or more items in it, with each item have an ID, quantity
and dollar price. The example uses 2 dependencies for defining schema and data
model. You may read more about these libraries in greater detail in their
perspective project later:
- [Todea Schema library](https://github.com/pocketgems/schema)
- [Todea DynamoDB library](https://github.com/pocketgems/dynamodb)

## Creating An API
You can create an API to look up order details like this:
```js
const { TxAPI, EXCEPTIONS: { NotFoundException } } = require('@pocketgems/app')

class GetOrderAPI extends TxAPI {
  static PATH = '/getOrder'
  static DESC = `Get an order by ID, if order doesn't exists a 404 Not found
    error is returned`

  static INPUT = Order.KEY
  static OUTPUT = {
    order: Order.Schema
  }
  static EXCEPTIONS = {
    NotFoundException
  }

  async computeResponse ({ tx, body }) {
    const order = await tx.get(Order, body.id)
    if (!order) {
      throw new NotFoundException()
    }
    return { order: order.toJSON() }
  }
}
```

You can read more about API interface [here](docs/libs/api.md).

## Creating An App
To create a Todea app, you have to call `makeApp` like this:
```js
const { makeApp } = require('@pocketgems/app')

const components = {
  Order,
  GetOrderAPI
}

module.exports = makeApp({
  service: 'unit-test',
  components,
  cookieSecret: 'unit-test',
  returnErrorDetail: true,
  healthCheckPath: '/',
  apiId: 'unittest',
  apiName: 'Unit Test',
  apiVersion: '2020-02-20',
  apiSignatureVersion: 'token',
  apiGlobalEndpoint: 'todea.example.com'
})
```

The `makeApp()` helper method creates a fastify instance with a few plugins
loaded already. You may customize the fastify instance further using fastify's
customization features. To start the app, you have to call `.listen()` according
to
[Fastify's documentation](https://www.fastify.io/docs/latest/Reference/Server/#listen), like this:
```js
// in src/server.js
const appPromise = require('./app')

appPromise.then(app => app.listen(8080, '0.0.0.0', (err) => {
  console.log(err)
  process.exit(1)
}))
```

# Components
Todea app is composed of components. A Todea app component can be an API, DB
Table ([db.Model](https://github.com/pocketgems/dynamodb#tables)), S3 bucket
etc. These components are passed to `makeApp()` in an object as `components`.
For example, `components` may be initialized like this:

```js
const components = {
  Order,
  GetOrderAPI
}

makeApp({
  components,
  ...
})
```

Internally, each of these components get registered to a corresponding system.
For example, API is registered with fastify as a route, while db table is
registered with AWS DynamoDB service, or as an AWS CloudFormation Resource if
Infrastructure-As-Code is required.

## Customizing Component Registration
The component system uses a visitor pattern to allow extending the registration
workflow with custom components. For example, to add a new type of component
`ExampleComponent`, you need to do the following:
1. Subclass `ComponentRegistrator`, and add a
   `registerExampleComponent (exampleComponent)` method
   ```js
   const { ComponentRegistrator } = require('@pocketgems/app')

   class CustomComponentRegistrator extends ComponentRegistrator {
       registerExampleComponent (exampleComponent) {
           // do what needs to be done
       }
   }
   ```
1. You can pass the new `CustomComponentRegistrator` class to
   [makeApp()](./make-app.md) like this
   ```js
   makeApp({
       RegistratorCls: CustomComponentRegistrator
   })
   ```
1. Implement `static register (registrator)` in the new `ExampleComponent` class
   ```js
   class ExampleComponent {
       static register (registrator) {
           registrator.registerExampleComponent(this)
       }
   }
   ```
1. Pass the new type of component as part of `components` like this
   `makeApp({ components: { ExampleComponent } })`

# Unit testing
## Setup
Todea apps store data in AWS DynamoDB service. You must setup the database
before running tests. You can run
`yarn --cwd ./node_modules/@pocketgems/app setup; yarn --cwd ./node_modules/@pocketgems/app start-local-db`
to start a local AWS DynamoDB docker instance. And use
`@pocketgems/app/test/environment.js` to setup Jest envrionments.

## Writing Tests
This library exposes `@pocketgems/unit-test` through
`@pocketgems/app/test/base-test` and adds 2 new symbols:
- `BaseAppTest` is the common base class for testing APIs. Useage is similar to
  BaseTest, but exposes a this.app handle to invoke APIs.

  You have to implement a `static async requireApp()` method to import the app.

- `mockGot` is a utility method to mock out-going requests from
  `this.callAPI()`. See examples of using this in this library's unit tests.

# Generating SDKs
## Swagger UI
This library generates an interactive Swagger UI for all APIs at /[service]/docs.

## OpenAPI SDKs
You can export APIs in an OpenAPI schema from /[service]/docs/json, and use that
with OpenAPI / Swagger SDK to generate SDKs in any supported languages.

CAUTION: Swagger SDKs use postional arguments in all SDKs, maintaining backward
compatibility will be challenging with vanilla SDK generators. You may customize
the generators to pass keyword arguments instead for languages that support it.

## AWS SDKs
This library adds REST APIs to generate C2J schemas. It is what AWS uses to
generate their SDKs and CLI. One set for public APIs and one set for private
APIs. In the following lines `group` can be `service`, `admin` or `user`.

- **/[service]/c2j/[group]/uid**: Returns the API version, e.g.
  example-2020-09-20.
- **/[service]/c2j/[group]/normal**: Returns the normal C2J schema. This schema
  contains API definition and documentations.
- **/[service]/c2j/[group]/api**: Returns normal C2J schema minus any
  documentation.
- **/[service]/c2j/[group]/docs**: Returns a docs C2J schema.

If there is no API to be exported, these endpoints will return empty string as
the response.
