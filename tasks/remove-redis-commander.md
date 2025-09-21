# Remove Redis Commander from Docker Compose

## Context
The docker compose stack currently includes a Redis Commander service and various `./docker/...` bind mounts. The user wants Redis Commander removed and any unused `./docker` bind mounts cleaned up. We also need to explain the purpose of the Postgres initialization volume binding (`./docker/postgres/init:/docker-entrypoint-initdb.d`).

## MVP Plan
1. Inspect `docker/docker-compose.yml` (or equivalent compose file) to confirm the Redis Commander service, identify related references (dependencies, networks, volumes), and review bind mounts under `./docker` to understand their usage.
2. Update the compose file to remove the Redis Commander service definition and eliminate redundant `./docker/...` bind mounts while ensuring remaining services still function.
3. Validate that the remaining services (Redis, Postgres, app) do not depend on the removed service or mounts; tweak docs or comments if needed.
4. Provide a written explanation for the Postgres init directory bind mount in the compose file and summarize the adjustments.

## Open Questions / Assumptions
- Assume no other files rely on the Redis Commander service (e.g., scripts or docs). If discovered otherwise, update plan.
- Assume `./docker/...` bind mounts can be removed if they only provide optional helper scripts/configs. Will verify before deleting.
