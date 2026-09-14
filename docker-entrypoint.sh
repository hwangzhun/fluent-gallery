#!/bin/sh
set -eu

# Bind mounts can be created by Docker with a different host UID.  Make the
# writable runtime state available to the unprivileged Node process first.
mkdir -p /app/data /app/uploads /app/logs
chown -R node:node /app/data
chown node:node /app/uploads /app/logs

# Containers recreated from the V1.0.8 configuration may retain its old
# TypeScript runtime command. The slim image ships only the compiled server,
# so transparently translate that legacy command during a rolling upgrade.
case "${1:-}" in
  tsx|node_modules/.bin/tsx|./node_modules/.bin/tsx|/app/node_modules/.bin/tsx)
    if [ "${2:-}" = "server/index.ts" ] || [ "${2:-}" = "/app/server/index.ts" ]; then
      set -- node dist-server/index.js
    fi
    ;;
esac

exec su-exec node "$@"
