class ComponentRegistrator {
  apis = []

  constructor (app, service) {
    this.app = app
    this.service = service
  }

  async registerComponents (components) {
    const promises = []
    for (const component of Object.values(components)) {
      if (component.register) {
        promises.push(component.register(this))
      }
    }
    await Promise.all(promises)
  }

  async registerAPI (api) {
    this.apis.push(api)
    await api.registerAPI(this)
  }

  async registerModel (model) {
    await model.createResources()
  }
}

module.exports = ComponentRegistrator
