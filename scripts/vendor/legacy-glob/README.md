# Build-only legacy glob adapter

`electron-builder` installs a Squirrel.Windows peer dependency even though this
project distributes portable Windows ZIPs. Its `temp` / `rimraf` chain still uses
the callback-based `glob` API. The old glob implementation relies on matcher
internals removed by the security-fixed minimatch 11 release.

This small adapter preserves the three interfaces that rimraf consumes:
`glob(pattern, options, callback)`, `glob.sync()` and `glob.hasMagic()`.
It delegates matching and traversal to pinned, maintained `glob` 14; it contains
no copied matcher or filesystem traversal implementation. It supports the
callback-only overload, sorted/default or unsorted results, pass-through traversal
options, Windows path separators and legacy brace-magic detection. Other legacy
glob features, including its EventEmitter API, are deliberately not exposed.

`tests/legacy-glob.test.ts` exercises both direct calls and the real installed
rimraf/temp chain. This package is build tooling and is excluded from the
application's packaged production dependencies.
