CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL CHECK(locale IN ('en', 'ja', 'zh-Hant')),
  state TEXT NOT NULL CHECK(state IN ('pending', 'active', 'unsubscribed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER
);
CREATE INDEX subscribers_expiry ON subscribers(state, expires_at);
CREATE TABLE consent_receipts (
  subscriber_id TEXT PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
  consent_at INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,
  locale TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source = 'onboarding'),
  app_version TEXT NOT NULL
);
CREATE TABLE rate_buckets (
  bucket_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_expiry ON rate_buckets(expires_at);
