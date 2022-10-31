# AWS SDK Schema Exporter <!-- omit in toc -->
Todea app library is setup to export API definitions to AWS C2J schema which is
used to generate AWS SDKs. You can export these schema from the following URIs,
and setup AWS SDK / CLI with custom models.

- [Exporter Endpoints](#exporter-endpoints)

# Exporter Endpoints
This plug-in adds a few REST APIs to fastify server for accessing the generated C2J schemas.
One set for public APIs and one set for private APIs. In the following lines `group` can be `service`, `admin` or `user`.

- **/[service]/c2j/[group]/uid**: Returns the API version, e.g. example-2020-09-20.
- **/[service]/c2j/[group]/normal**: Returns the normal C2J schema. This schema contains API definition and documentations.
- **/[service]/c2j/[group]/api**: Returns normal C2J schema minus any documentation.
- **/[service]/c2j/[group]/docs**: Returns a docs C2J schema.

If there is no API to be exported, these endpoints will return empty string as the response.
