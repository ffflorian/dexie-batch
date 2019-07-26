const testSubject = process.env.TEST_SUBJECT || 'dist/dexie-batch'

module.exports = require(`../../${testSubject}`)
