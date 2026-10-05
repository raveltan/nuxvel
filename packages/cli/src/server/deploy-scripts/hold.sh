watcher=$NUXVEL_APP_DIR/hold.cjs
log=$NUXVEL_APP_DIR/hold.log

write_file 600 "$watcher" "$NUXVEL_WATCHER"
write_file 600 "$NUXVEL_APP_DIR/hold.json" "$NUXVEL_HOLD"
install -m 600 /dev/null "$log"
setsid nohup node "$watcher" "$NUXVEL_APP_DIR/hold.json" >> "$log" 2>&1 < /dev/null &
pid=$!
echo "$pid" > "$NUXVEL_APP_DIR/hold.pid"
start=0
