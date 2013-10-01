'use strict';

var file = require('./file');

var _ = require('lodash');
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
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

/**
 * @param  {Object} files
 * @return {Object}
 */
function processFile(file) {
  _.each(srcMatches, function(options) {
    var match = new RegExp(options.srcMatch);
    if (file.src.match(match)) { options.processContents(file); }
  });

  return file;
}

////////////////////////////////////////

function getPaths(options) {
  options = _.defaults({}, options, {
    cwd: './',
    patterns: [
      '*.js',
      '*.css',
      '*.scss',
      '*.html',
      '!*spec.js*'
    ],
    process: function process(filepath) {
      // Prepend cwd to src path if necessary.
      if (options.cwd) { filepath = path.join(options.cwd, filepath); }
      return filepath;
    }
  });

  return _.compose(
    function processFiles(files) {
      return files.map(options.process);
    },
    function expandPatterns() {
      return file.expand(options.patterns, options);
    }
  )();
}

/**
 * @param  {Object} options
 * @return {Function}
 */
function createComponentContents(options) {
  options = _.defaults({}, options, {
    process: processFile,
    prependPrefix: '',
    stripPrefix: '',
    paths: []
  });

  var stripPrefix = new RegExp('^' + options.stripPrefix);
  var prependPrefix = options.prependPrefix;
  var cacheIdFromPath = options.cacheIdFromPath ||function (filepath) {
    return prependPrefix + filepath.replace(stripPrefix, '');
  };

  return _.compose(
    wrapFile,
    concatFiles,
    function processFiles(files) {
      return files.map(options.process);
    },
    function readPaths() {
      return options.paths.map(function(src) {
        if (_.isString(src) && src.length > 0) {
          return {
            src: cacheIdFromPath(src),
            contents: file.read(src, options)
          };
        }
      });
    }
  )();
}

/**
 * @param  {String} src
 * @param  {Object} options
 * @return {String}
 */
function getComponentFilepath(src, options) {
  options = _.extend({
    encoding: 'utf8',
    algorithm: 'md5',
    length: 8
  }, options);
  var hash = crypto.createHash(options.algorithm)
    .update(src, options.encoding).digest('hex');
  var suffix = hash.slice(0, options.length);
  var filename = 'ng-component-' + suffix + '.js';
  return path.resolve('.tmp', filename);
}

function isComponentExpired(fullpath, paths) {
  if (!file.exists(fullpath)) { return true; }

  var componentMtime = fs.statSync(fullpath).mtime;
  return paths.map(function(path) {
    return fs.statSync(path).mtime;
  }).some(function(mtime) {
    return mtime > componentMtime;
  });
}

/**
 * @param  {Object} options
 * @return {String}
 */
function writeComponentContents(options) {
  options = options || {};
  var paths = getPaths({
    patterns: options.patterns,
    cwd: options.cwd
  });
  var fullpath = getComponentFilepath(paths.join(''));

  if (isComponentExpired(fullpath, paths)) {
    var contents = createComponentContents({
      process: options.process,
      prependPrefix: options.prependPrefix,
      stripPrefix: options.stripPrefix,
      paths: paths,
    });
    file.write(fullpath, contents);
  }

  return fullpath;
}

var componentScriptBuilder = {
  contents: createComponentContents,
  write: writeComponentContents
};

module.exports = componentScriptBuilder;
