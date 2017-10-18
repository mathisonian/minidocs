var assert = require('assert')
var path = require('path')
var fs = require('fs')

module.exports = function createOutputDir (app, options, callback) {
  assert.ok(options)
  assert.ok(options.argv)

  if (options.argv.cname) {
    fs.writeFile(path.join(options.outputDir, 'CNAME'), options.argv.cname, 'utf8', callback)
  } else {
    callback()
  }
}
