'use strict';

var file = require('./file');

var _ = require('lodash');
var path = require('path');
var os = require('os');
var cleanCSS = require('clean-css');
var sass = require('node-sass');
var htmlMinifier = require('html-minifier');
var genereteAngularTemplate = require('generate-angular-template');
var genereteAngularCssModule = require('generate-angular-css-module');

function minifyCss(css) {
  return cleanCSS.process(css);
}

function minifyHtml(html) {
  return htmlMinifier.minify(html, { collapseWhitespace: true });
}

function renderScss(scss) {
  return sass.renderSync({
    data: scss,
    includePaths: ['./src/'],
    outputStyle: 'compressed'
  });
}

function angularTemplate(filename, contents) {
  return genereteAngularTemplate({
    htmlPath: filename,
    content: contents
  });
}

function angularCssModule(filename, contents) {
  return genereteAngularCssModule({
    moduleName: filename,
    content: contents
  });
}

////////////////////////////////////////

/**
 * @param  {String} file
 * @return {String}
 */
function wrapFile(file) {
  return '(function(){ \'use strict\';\n' +
    file +
  '\n})();';
}

/**
 * @param  {Array} files
 * @return {String}
 */
function concatFiles(files) {
  return files.map(function(file) {
    return file.contents;
  }).join('\n');
}

/**
 * @param  {Array} files
 * @return {Array}
 */
function processFileContents(files) {
  var srcMatches = [{
    srcMatch: '\\.css$',
    processContents: function(file) {
      var minifiedCss = minifyCss(file.contents);
      file.contents = angularCssModule(file.src, minifiedCss);
      return file;
    }
  },
  {
    srcMatch: '\\.scss$',
    processContents: function(file) {
      var compiledCss = renderScss(file.contents);
      file.contents = angularCssModule(file.src, compiledCss);
      return file;
    }
  },
  {
    srcMatch: '\\.html$',
    processContents: function(file) {
      var minifiedHtml = minifyHtml(file.contents);
      file.contents = angularTemplate(file.src, minifiedHtml);
      return file;
    }
  }];

  _.each(srcMatches, function(options) {
    var match = new RegExp(options.srcMatch);

    _.each(files, function(file) {
      if (file.src.match(match)) { options.processContents(file); }
    });
  });

  return files;
}

////////////////////////////////////////

/**
 * @param  {Object} options
 * @return {Function}
 */
function createComponent(options) {
  options = _.defaults({}, options, {
    cwd: './',
    patterns: [
      '*.js',
      '*.css',
      '*.scss',
      '*.html',
      '!*spec.js*'
    ],
    process: function process(file) {
      file.src = file.src.replace(options.cwd, '');
      return file;
    },
    filter: function filter() {
      return true;
    }
  });

  return _.compose(
    wrapFile,
    concatFiles,
    processFileContents,
    function processFiles(files) {
      return files.map(options.process);
    },
    function filterFiles(files) {
      return files.filter(options.filter);
    },
    function getFiles() {
      return file.readPattern(options.patterns, options);
    }
  );
}

/**
 * @param  {String} contents
 * @return {String}
 */
function writeComponent(contents) {
  var dir = os.tmpdir();
  var filename = 'component-' + path.basename(process.cwd()) + '.js';
  var fullpath = path.join(dir, filename);
  file.write(fullpath, contents);
  return fullpath;
}

/**
 * @param  {Object} options
 * @return {String}
 */
function createWrite(options) {
  var componentScript = createComponent(options);
  var contents = componentScript();
  var filepath = writeComponent(contents);
  return filepath;
}

var componentScriptBuilder = {
  create: createComponent,
  write: writeComponent,
  createWrite: createWrite
};

module.exports = componentScriptBuilder;
