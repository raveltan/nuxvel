for file in "$NUXVEL_APP_DIR/releases/$NUXVEL_RELEASE/.output/server/nuxvel/migrations/contract/"*.sql; do
  if [ -e "$file" ]; then echo "@contract $(basename "$file" .sql)"; fi
done
