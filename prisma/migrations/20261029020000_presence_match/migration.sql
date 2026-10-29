-- Self-declared gender and who the person wants to talk to, used only for
-- mutual matching on the server.
ALTER TABLE "Presence" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'x';
ALTER TABLE "Presence" ADD COLUMN "seeking" TEXT NOT NULL DEFAULT 'any';
