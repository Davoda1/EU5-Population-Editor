"use strict";

// Only rimraf 2's callable, sync and hasMagic interfaces are needed here.
// All parsing and traversal remain in the maintained glob implementation.
const secureGlob = require("secure-glob");

function optionsFor(options = {}) {
  if (options.withFileTypes || options.nonull || options.nounique) {
    throw new TypeError("The build-only legacy glob adapter supports unique string matches only.");
  }
  return {
    ...options,
    windowsPathsNoEscape: options.windowsPathsNoEscape ??
      (options.allowWindowsEscape === false || (options.platform || process.platform) === "win32"),
  };
}

function finish(matches, options) {
  return options.nosort ? matches : matches.sort((a, b) => a.localeCompare(b, "en"));
}

function legacyGlob(pattern, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  options = options || {};
  if (typeof callback !== "function") {
    throw new TypeError("The build-only legacy glob adapter requires a callback.");
  }
  // A rejected traversal invokes the callback once and never implies success.
  Promise.resolve().then(() => secureGlob.glob(pattern, optionsFor(options)))
    .then(matches => callback(null, finish(matches, options)), error => callback(error));
}

legacyGlob.glob = legacyGlob;
legacyGlob.sync = (pattern, options = {}) =>
  finish(secureGlob.globSync(pattern, optionsFor(options)), options);
legacyGlob.hasMagic = (pattern, options = {}) =>
  secureGlob.hasMagic(pattern, { ...optionsFor(options), magicalBraces: true });

module.exports = legacyGlob;
