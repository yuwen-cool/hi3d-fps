#!/bin/bash
# waits for each Hi3D model, bakes it once (skips if public/models/<name>.glb exists)
cd "$(dirname "$0")/.."
Q=(
 "robot 60000 4096 --emissive orange -- --tex 2048 --norm 2048 --orm 1024 --skin"
 "tank 60000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "tower 60000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "valves 30000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "barrier 16000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "hazard_fence 16000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "glove_r 24000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "glove_l 24000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "piperack 40000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "drums 26000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "stairs 30000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "rubble 24000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "shrub 40000 2048 -- --tex 1024 --norm 1024 --orm 512"
 "wall_broken 30000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "lamp 8000 1024 -- --tex 1024 --norm 1024 --orm 512"
 "mag 10000 2048 -- --tex 2048 --norm 2048 --orm 1024"
 "rifle2 160000 4096 -- --tex 4096 --norm 4096 --orm 2048"
)
for round in $(seq 1 120); do
  left=0
  for e in "${Q[@]}"; do
    set -- $e; n=$1
    [ -f public/models/$n.glb ] && continue
    if [ -f assets/hi3d/${n}_model.glb ]; then echo "== $n $(date +%T)"; tools/bake_asset.sh $e 2>&1 | grep -E "BAKE .*DONE|out|Error|Traceback" ; else left=$((left+1)); fi
  done
  [ $left == 0 ] && break
  sleep 60
done
echo QUEUE_DONE
