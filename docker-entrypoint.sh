#!/bin/sh
set -eu

# Bind mounts can be created by Docker with a different host UID.  Make the
# writable runtime state available to the unprivileged Node process first.
mkdir -p /app/data /app/uploads /app/logs
chown -R node:node /app/data
chown node:node /app/uploads /app/logs

# The first argument after `sh -c` becomes $0, so provide a placeholder and
# preserve the complete Docker CMD in $@.
exec su -s /bin/sh node -c 'exec "$@"' fluent-gallery "$@"
