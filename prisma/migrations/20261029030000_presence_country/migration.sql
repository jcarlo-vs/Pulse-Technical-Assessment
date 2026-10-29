-- Country of the (already offset) dot, as an ISO 3166 alpha-2 code, for
-- the country filter. Empty until the client has looked it up.
ALTER TABLE "Presence" ADD COLUMN "country" TEXT NOT NULL DEFAULT '';
