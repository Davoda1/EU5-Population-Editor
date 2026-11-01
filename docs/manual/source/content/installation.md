Choose the package for your operating system. Normal use requires no Python, Node.js, Rust installation or online service.

## Windows 10 and 11

1. Download the Windows x86-64 portable ZIP from the project's [releases page](https://github.com/Davoda1/EU5-Population-Editor/releases).
2. Extract the entire archive to its own directory.
3. Open **EU5 Population & Demographics Editor.exe** at the archive root.

Keep the adjacent runtime files and the `resources` directory together. Moving only the EXE will break the application. There is no launcher script. The application is unsigned; check the release origin and checksum before launching it.

## GNU/Linux portable

Download the Linux x86-64 TAR.GZ and extract it to its own directory. Run the `eu5-population-editor` binary at the archive root as your ordinary desktop user. Keep all its runtime files together.

Read the included `RUNNING.txt` for distribution-specific library and sandbox requirements. The application uses Electron's Linux desktop libraries and needs glibc; musl-only distributions are not supported. Do not run the editor as root or disable its sandbox to work around an installation problem.

## Debian and Ubuntu

Download the `amd64.deb` package and install it using your package manager, for example from the directory containing the downloaded file:

```sh
sudo apt install ./eu5-population-editor_1.0.3_amd64.deb
```

Start the application from the desktop application menu or run `eu5-population-editor`. The package installs a regular native entry executable in `/usr/bin` and its runtime in `/usr/lib/eu5-population-editor`.

## Check the download

Compare the file's SHA-256 hash with the release's `SHA256SUMS`. On Windows, use PowerShell `Get-FileHash -Algorithm SHA256` with the downloaded file. On Linux, use `sha256sum` with the file. A successful checksum comparison detects a damaged or altered download; obtain both the archive and checksum from the intended release.

## Updates and removal

For portable updates, extract the new archive into a new directory; do not mix runtime files from different versions. Install a new DEB using the package manager. Your settings and map cache live outside the application directory, and your project files remain where you saved them.

To remove a portable installation, close the application and remove its extracted directory. Remove a DEB through the package manager. Deleting an installation does not automatically delete saved projects. See [Privacy and data](privacy.html) for settings and cache locations.
