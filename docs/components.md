# Component System
Todea apps are built with components like API, DB Table (db.Model). Each of
these component gets registered to a corresponding system. For example, API is
registered with fastify, while db table is registered with AWS DynamoDB service,
or as an AWS CloudFormation Resource if Infrastructure-As-Code is required.

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
1. Pass the new type of component as part of
   `makeApp({ components: { ExampleComponent } })`
