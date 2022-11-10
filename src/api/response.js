const S = require('@pocketgems/schema')

module.exports = {
  NO_OUTPUT: S.str.max(0).lock(),
  UNVALIDATED: undefined
}
