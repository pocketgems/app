class ComponentRegistrator {
  promises = []
  apis = []

  constructor (app, service) {
    this.app = app
    this.service = service
  }

  registerAPI (api) {
    this.apis.push(api)
    api.registerAPI(this)
  }

  registerModel (model) {
    this.promises.push(model.createResources())
  }
}

module.exports = ComponentRegistrator
