-- nuxvel:no-transaction
CREATE INDEX CONCURRENTLY "push_subscriptions_session_id_idx" ON "push_subscriptions" USING btree ("session_id");
