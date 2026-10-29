-- A private link to a shoot's gallery that opens without signing in (for one-time
-- shoots, or anyone who isn't in the portal). Turning the link off clears the token.
alter table content_shoots add column if not exists gallery_share_token text unique;
