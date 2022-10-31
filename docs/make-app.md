# makeApp() helper method
The `makeApp()` helper method creates a fastify instance with custom
configurations. You must call this method from `src/app.js`, because unit tests
are setup to look for Todea app from this location. For example,
```js
// src/app.js
const { makeApp } = require('@pocketgems/app')

module.exports = makeApp({
  service: 'unit-test',
  components,
  cookieSecret: 'unit-test',
  returnErrorDetail: true,
  apiId: 'unittest',
  apiName: 'Unit Test',
  apiVersion: '2020-02-20',
  apiSignatureVersion: 'token',
  apiGlobalEndpoint: 'todea.example.com'
})
```
