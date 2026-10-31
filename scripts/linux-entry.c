/* Native Debian entry point. Electron must remain beside its runtime assets.
 * This regular ELF executable, not a script or symlink, is the sole /usr/bin
 * file. execv preserves the caller's arguments and replaces this process.
 */
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    (void)argc;
    const char *executable = "/usr/lib/eu5-population-editor/eu5-population-editor";
    argv[0] = (char *)executable;
    execv(executable, argv);
    const int error = errno;
    fprintf(stderr, "Cannot start EU5 Population Editor: %s (%s)\n", executable, strerror(error));
    return error == ENOENT ? 127 : 126;
}
