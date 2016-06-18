#! /usr/bin/env node

var fs = require('fs')
var path = require('path')
var read = require('read-directory')
var parsePath = require('parse-filepath')
var createHTML = require('create-html')
var browserify = require('browserify')
var minimist = require('minimist')
var mkdir = require('mkdirp')
var rm = require('rimraf')
var exit = require('exit')

var debug = require('debug')('minidocs')
var minidocs = require('./app')

var parseContents = require('./lib/parse-contents')
var parseMarkdown = require('./lib/parse-markdown')

var cwd = process.cwd()
var cwdParsed = parsePath(cwd)
var projectdir = cwdParsed.name
var argv = minimist(process.argv.slice(2), {
  alias: {
    c: 'contents',
    o: 'output',
    t: 'title',
    l: 'logo',
    s: 'css',
    i: 'initial',
    p: 'pushstate',
    h: 'help'
  },
  default: {
    output: 'site',
    title: projectdir
  }
})

var outputDir = path.resolve(cwd, argv.output)

if (argv.help) {
  usage()
}

if (argv._[0]) {
  var source = path.resolve(cwd, argv._[0])
  var markdown = read.sync(source, { extensions: false })
} else {
  error('\nError:\nsource markdown directory is required', { usage: true })
}

if (argv.contents) {
  var contentsPath = path.resolve(process.cwd(), argv.contents)
} else {
  error('\nError:\n--contents/-c option is required', { usage: true })
}

if (argv.logo) {
  var logo = path.parse(argv.logo).base
}

var state = {
  title: argv.title,
  logo: logo,
  contents: require(contentsPath),
  markdown: markdown,
  initial: argv.initial || Object.keys(markdown)[0]
}

var contents = parseContents(state.contents)
var documents = parseMarkdown(state.markdown)
var app = minidocs(state)
state.contents = contents

function usage (exitcode) {
  console.log(`
  Usage:
    minidocs {sourceDir} -c {contents.json} -o {buildDir}

  Options:
    * --contents, -c     JSON file that defines the table of contents
    * --output, -o       Directory for built site [site]
    * --title, -t        Project name [name of current directory]
    * --logo, -l         Project logo
    * --css, -s          Optional stylesheet
    * --initial, -i      Page to use for root url
    * --pushstate, p     Create a 200.html file for hosting services like surge.sh
    * --help, -h         Show this help message
  `)
  exit(exitcode || 0)
}

function error (err, opts) {
  console.log(err)
  if (opts && opts.usage) usage(1)
}

function createOutputDir (done) {
  debug('createOutputDir', outputDir)
  rm(outputDir, function (err) {
    if (err) return error(err)
    mkdir(outputDir, done)
  })
}

function buildHTML (done) {
  Object.keys(documents.routes).forEach(function (key) {
    var route = documents.routes[key]
    var dirpath = path.join(outputDir, route)
    var filepath = path.join(dirpath, 'index.html')
    var page = app.toString(route, state)

    var html = createHTML({
      title: state.title,
      body: page,
      script: '/bundle.js',
      css: '/bundle.css'
    })

    mkdir(dirpath, function (err) {
      if (err) error(err)
      fs.writeFile(filepath, html, function (err) {
        if (err) error(err)
        done()
      })
    })
  })
}

function buildJS (done) {
  var filepath = path.join(outputDir, 'index.js')
  
  if (argv.css) {
    var customStylePath = path.join(cwd, argv.css)
    var customStyle = argv.css ? `css('${customStylePath}', { global: true })` : ''
  }

  var js = `
  var insertCSS = require('insert-css')
  var css = require('sheetify')
  var minidocs = require('minidocs')(${JSON.stringify(state)})
  ${customStyle}
  minidocs.start('#choo-root')
  `

  fs.writeFile(filepath, js, function (err) {
    if (err) return error(err)
    browserify(filepath, { paths: [path.join(__dirname, 'node_modules')] })
      .transform(require('sheetify/transform'), { global: true })
      .plugin(require('css-extract'), { out: path.join(outputDir, 'bundle.css') })
      .bundle(function (err, src) {
        if (err) return error(err)
        var filepath = path.join(outputDir, 'bundle.js')
        fs.writeFile(filepath, src, function (err) {
          debug('bundle.js', filepath)
          if (err) return error(err)
          done()
        })
      })
  })
}

function createLogo () {
  var logopath = path.join(outputDir, logo)
  var writelogo = fs.createWriteStream(logopath)
  fs.createReadStream(argv.logo).pipe(writelogo)
}

createOutputDir(function () {
  debug('createOutputDir')

  buildJS(function () {
    buildHTML(function () {
      if (argv.logo) createLogo()
      if (argv.pushstate) createPushstateFile()
    })
  })
})

function createPushstateFile (done) {
  var page = app.toString('/', state)
  var pushstatefile = path.join(outputDir, '200.html')

  var html = createHTML({
    title: state.title,
    body: page,
    script: '/bundle.js',
    css: '/bundle.css'
  })

  fs.writeFile(pushstatefile, html, function (err) {
    if (err) return error(err)
  })
}