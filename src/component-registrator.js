class ComponentRegistrator {
  promises = []
  apis = []

  constructor (app, service) {
    this.app = app
    this.service = service
  }

  async registerComponents (components) {
    for (const component of Object.values(components)) {
      if (component.register) {
        component.register(this)
      }
    }
    await Promise.all(this.promises)
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
