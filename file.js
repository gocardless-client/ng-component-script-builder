'use strict';

var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var glob = require('glob');
var iconv = require('iconv-lite');

var file = {
  defaultEncoding: 'utf8'
};

// Process specified wildcard glob patterns or filenames against a
// callback, excluding and uniquing files in the result set.
var processPatterns = function processPatterns(patterns, fn) {
  // Filepaths to return.
  var result = [];
  // Iterate over flattened patterns array.
  _.flatten(patterns).forEach(function(pattern) {
    // If the first character is ! it should be omitted
    var exclusion = pattern.indexOf('!') === 0;
    // If the pattern is an exclusion, remove the !
    if (exclusion) { pattern = pattern.slice(1); }
    // Find all matching files for this pattern.
    var matches = fn(pattern);
    if (exclusion) {
      // If an exclusion, remove matching files.
      result = _.difference(result, matches);
    } else {
      // Otherwise add matching files.
      result = _.union(result, matches);
    }
  });
  return result;
};

// Return an array of all file paths that match the given wildcard patterns.
file.expand = function expand(patterns, options) {
  if (patterns.length === 0) { return []; }
  // Return all matching filepaths.
  return processPatterns(patterns, function(pattern) {
    // Find all matching files for this pattern.
    return glob.sync(pattern, options);
  });
};

// Read a file, return its contents.
file.read = function read(filepath, options) {
  if (!options) { options = {}; }
  var contents;
  console.log('Reading ' + filepath + '...');
  try {
    contents = fs.readFileSync(String(filepath));
    // If encoding is not explicitly null, convert from encoded buffer to a
    // string. If no encoding was specified, use the default.
    if (options.encoding !== null) {
      contents = iconv.decode(contents, options.encoding || file.defaultEncoding);
      // Strip any BOM that might exist.
      if (contents.charCodeAt(0) === 0xFEFF) {
        contents = contents.substring(1);
      }
    }
    return contents;
  } catch(e) {
    console.error(
      'Unable to read "' + filepath + '" file (Error code: ' + e.code + ').'
    );
    throw e;
  }
};

file.readPattern = function readPattern(patterns, options) {
  // Find all files matching pattern, using passed-in options.
  return file.expand(patterns, options).map(function(src) {
    // Prepend cwd to src path if necessary.
    if (options.cwd) { src = path.join(options.cwd, src); }

    return {
      src: src,
      contents: file.read(src)
    };
  });
};

var pathSeparatorRe = /[\/\\]/g;

// True if the file path exists.
file.exists = function() {
  var filepath = path.join.apply(path, arguments);
  return fs.existsSync(filepath);
};

// Like mkdir -p. Create a directory and any intermediary directories.
file.mkdir = function(dirpath, mode) {
  // Set directory mode in a strict-mode-friendly way.
  if (mode == null) {
    mode = parseInt('0777', 8) & (~process.umask());
  }
  dirpath.split(pathSeparatorRe).reduce(function(parts, part) {
    parts += part + '/';
    var subpath = path.resolve(parts);
    if (!file.exists(subpath)) {
      try {
        fs.mkdirSync(subpath, mode);
      } catch(e) {
        console.error(
          'Unable to create directory "' + subpath +
          '" (Error code: ' + e.code + ').'
        );
        throw e;
      }
    }
    return parts;
  }, '');
};

// Write a file.
file.write = function(filepath, contents, options) {
  if (!options) { options = {}; }
  console.log('Writing ' + filepath + '...');
  // Create path, if necessary.
  file.mkdir(path.dirname(filepath));
  try {
    // If contents is already a Buffer, don't try to encode it. If no encoding
    // was specified, use the default.
    if (!Buffer.isBuffer(contents)) {
      contents = iconv.encode(contents, options.encoding || file.defaultEncoding);
    }
    fs.writeFileSync(filepath, contents);
    return true;
  } catch(e) {
    console.error(
      'Unable to write "' + filepath + '" file (Error code: ' + e.code + ').'
    );
    throw e;
  }
};

exports = file;
