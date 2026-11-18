#!/bin/sh
# Builds upload zips for both stores into no_zip/dist/.
#   sh no_zip/build.sh
# Firefox uses src/manifest.json as-is. Chrome gets a generated manifest with a
# service worker background and without Firefox-only keys.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SRC="$ROOT/src"
OUT="$ROOT/no_zip/dist"
VERSION=$(python3 -c "import json;print(json.load(open('$SRC/manifest.json'))['version'])")

rm -rf "$OUT" && mkdir -p "$OUT"

# Firefox: zip src/ as-is
(cd "$SRC" && zip -q -r -X "$OUT/block-urge-firefox-$VERSION.zip" . -x "*.DS_Store")

# Chrome: copy src/, swap in a Chrome manifest
STAGE=$(mktemp -d)
cp -R "$SRC/" "$STAGE/"
python3 - "$STAGE/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
m = json.load(open(p))
m["background"] = {"service_worker": "background.js"}
m.pop("browser_specific_settings", None)
json.dump(m, open(p, "w"), indent=2, ensure_ascii=False)
PY
(cd "$STAGE" && zip -q -r -X "$OUT/block-urge-chrome-$VERSION.zip" . -x "*.DS_Store")
rm -rf "$STAGE"

echo "Built:"
ls -1 "$OUT"
