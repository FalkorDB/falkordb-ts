#!/usr/bin/env bash
# Picks the FalkorDB Docker image for a release line, the same way locally and
# in CI.
#
#   scripts/falkordb-image.sh <line>
#       Prints the image tag (of falkordb/falkordb) for a line:
#         4     the newest vX.Y.Z release of 4.x, from Docker Hub
#         6     latest (check it with --check once it runs, as below)
#         edge  edge, the nightly build
#       When Docker Hub cannot be reached, prints a pinned tag and warns.
#
#   scripts/falkordb-image.sh --check <line> <graph module version>
#       Fails unless the `graph` module version that MODULE LIST reports
#       (e.g. 42205 for 4.22.5) belongs to the line, so that `latest` moving
#       to 7.0 cannot silently turn the 6.x leg into something else. `edge`
#       reports a placeholder (999999), so for it only 6.x or later is checked.
#
# FALKORDB_TAGS_FILE, when set, is read for the tags (one per line) in place
# of Docker Hub, for tests.

set -euo pipefail

# Used when Docker Hub cannot be reached, so its outage does not fail CI
FALLBACK_4=v4.22.5

TAGS_URL='https://hub.docker.com/v2/repositories/falkordb/falkordb/tags?name=v4.&page_size=100'
# Docker Hub pages the tags; 4.x has fewer than 10 pages
MAX_PAGES=20

usage() {
    echo "usage: $0 <4|6|edge> | $0 --check <4|6|edge> <graph module version>" >&2
    exit 2
}

warn() {
    # A GitHub Actions annotation, which reads fine in a terminal too
    echo "::warning::$*" >&2
}

fail() {
    echo "::error::$*" >&2
    exit 1
}

# Prints the 4.x tags Docker Hub has, one per line
fetch_4_tags() {
    if [[ -n "${FALKORDB_TAGS_FILE:-}" ]]; then
        cat "$FALKORDB_TAGS_FILE"
        return
    fi
    # Each step returns on failure itself: newest_4 calls this in a
    # condition, where set -e does not apply, and a page that failed must
    # reach the fallback rather than end the listing early
    local url=$TAGS_URL page body
    for ((page = 0; page < MAX_PAGES; page++)); do
        body=$(curl -fsS --retry 2 --max-time 20 "$url") || return 1
        jq -r '.results | map(.name) | .[]' <<<"$body" || return 1
        url=$(jq -er '.next // ""' <<<"$body") || return 1
        [[ -z "$url" ]] && return 0
    done
    echo "more than $MAX_PAGES pages of tags" >&2
    return 1
}

# The newest vX.Y.Z of 4.x, compared as numbers (v4.10.0 > v4.9.0), skipping
# suffixed builds such as -alpine or -x64
newest_4() {
    local tags newest
    if ! tags=$(fetch_4_tags); then
        warn "Could not list the FalkorDB 4.x tags on Docker Hub; using $FALLBACK_4"
        echo "$FALLBACK_4"
        return
    fi
    newest=$(grep -E '^v4\.[0-9]+\.[0-9]+$' <<<"$tags" | sort -t. -k2,2n -k3,3n | tail -n 1 || true)
    if [[ -z "$newest" ]]; then
        warn "Docker Hub listed no FalkorDB 4.x release tag; using $FALLBACK_4"
        newest=$FALLBACK_4
    fi
    echo "$newest"
}

check() {
    local line=$1 version=$2 min max
    [[ "$version" =~ ^[0-9]+$ ]] || fail "Not a graph module version: '$version'"
    case $line in
        4) min=40000 max=50000 ;;
        6) min=60000 max=70000 ;;
        edge) min=60000 max= ;;
        *) usage ;;
    esac
    if ((version < min)) || { [[ -n "$max" ]] && ((version >= max)); }; then
        fail "FalkorDB line $line expected, but the server runs graph module $version"
    fi
    echo "graph module $version belongs to FalkorDB line $line"
}

case ${1:-} in
    --check)
        [[ $# -eq 3 ]] || usage
        check "$2" "$3"
        ;;
    4) newest_4 ;;
    6) echo latest ;;
    edge) echo edge ;;
    *) usage ;;
esac
