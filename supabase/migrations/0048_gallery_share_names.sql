-- Share links end in the client's business name (/g/an-unblurred-lady) instead of random letters.
-- Links already sent with the random ending keep working.
alter table content_shoots add column if not exists gallery_share_slug text unique;
