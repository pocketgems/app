const components = require('../examples')

const { makeApp } = require('.')

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
