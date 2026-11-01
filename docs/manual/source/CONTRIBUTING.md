# Contributing

Base changes on `master` and target `master` in pull requests. Keep instructions consistent with the supported application version and verify control labels against the application. Explain the user action and result in plain English.

## Repository structure

| Path | Purpose |
| --- | --- |
| `content/` | Manual chapters in Markdown |
| `scripts/build.py` | Chapter order, page titles and HTML generation |
| `assets/` | Styles, browser behavior, icons and application screenshots |
| `scripts/check.py` | Generated-page, local-link, anchor and search-index validation |
| `scripts/test_build.py` | Hosted/offline chapter parity and reproducible output checks |
| `docs/DEPLOYMENT.md` | Static hosting and deployment instructions |

Use original or clearly licensed assets. Do not add game source files, credentials or personal data. Screenshots must show the actual application and be checked for private information before inclusion.

## Validate changes

Run the build and page/link checks described in README.md. When browser scripts change, also check their syntax:

```sh
node --check assets/theme.js
node --check assets/manual.js
python scripts/test_build.py
```

Check affected pages in a browser, including mobile layout, both color themes and search when relevant. Keep all browser assets local and preserve the site's ability to work from a subdirectory and from disk. The generated `dist/` directory is a build artifact and is not committed in this repository. Generate the bundled edition with `python scripts/build.py --offline`; its chapter content must match the hosted edition. The application's source distribution keeps its own frozen offline snapshot and exact source/site hash inventory.

The **Build manual** workflow repeats build, link and JavaScript checks for pushes and pull requests targeting `master`. It uploads the complete `eu5-population-editor-manual` website artifact.

## License

By contributing original changes, you agree to license them under AGPL-3.0-only. Retain third-party notices for reused material. Describe the change and its validation in the pull request.
