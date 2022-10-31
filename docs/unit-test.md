# Unit Testing Guide <!-- omit in toc -->
This guide will help you setup test environment and write your first unit test.

# Setup
Todea apps store data in AWS DynamoDB service. You must setup the database
before running tests. You can run
`yarn --cwd ./node_modules/@pocketgems/app setup; yarn --cwd ./node_modules/@pocketgems/app start-local-db`
to start a local AWS DynamoDB docker instance. And use
`@pocketgems/app/test/environment.js` to setup Jest envrionments.

# Writing Tests
This library exposes `@pocketgems/unit-test` through
`@pocketgems/app/test/base-test` and adds 2 new symbols:
- `BaseAppTest` is the common base class for testing APIs. Useage is similar to
  BaseTest, but exposes a this.app handle to invoke APIs.
- `mockGot` is a utility method to mock out-going requests from
  `this.callAPI()`. See examples of using this in this library's unit tests.

