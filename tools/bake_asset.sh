#!/bin/bash
# tools/bake_asset.sh <name> <tris> <bakeTex> [delight args...] -- [assemble args...]
set -e
N=$1; TRIS=$2; TS=$3; shift 3
D=assets/baked/$N; mkdir -p $D
SRC=assets/hi3d/${N}_model.glb
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/bake.py -- $SRC $D $TRIS $TS 2>&1 | grep -E "^BAKE|Error|Traceback" | tail -4
DA=(); AA=(); seen=0
for x in "$@"; do if [ "$x" == "--" ]; then seen=1; elif [ $seen == 0 ]; then DA+=("$x"); else AA+=("$x"); fi; done
python3 tools/delight.py $D "${DA[@]}" | cut -c1-300
node tools/assemble.mjs $D $N "${AA[@]}"

ls public/models/*.glb | xargs -n1 basename | sed "s/.glb//" | python3 -c "import sys,json;print(json.dumps([l.strip() for l in sys.stdin]))" > public/models/index.json
