// From command line run `node server.js` to start a server instance
// You can view a demo swagger doc at http://0.0.0.0:8090/app/docs

require('../test/environment')

const pathToApp = '../src/app'
// example start
require(pathToApp)
  .then(app => app.listen({ port: 8090, host: '0.0.0.0' }))
  .catch((err) => {
    console.log(err)
    process.exit(1)
  })
// example end
