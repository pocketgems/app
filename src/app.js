const components = require('../examples')

const { makeApp } = require('.')

// example start
module.exports = makeApp({
  service: 'unittest',
  components,
  cookie: {
    secret: 'unit-test'
  },
  logging: {
    reportErrorDetail: true, // process.env.NODE_ENV === 'localhost',
    unittesting: true, // process.env.NODE_ENV === 'localhost',
    reportAllErrors: true // process.env.NODE_ENV !== 'prod'
  },
  awsC2j: {
    version: '2020-02-20',
    displayName: 'Unit Test',
    signatureVersion: 'v4',
    globalEndpoint: 'todea.example.com',
    globalHeaders: ['x-app', 'x-uid', 'x-admin', 'x-token']
  },
  swagger: {
    disabled: false,
    authHeaders: ['x-app', 'x-uid', 'x-admin', 'x-token'],
    servers: ['http://localhost:8080']
  }
})
// example end
