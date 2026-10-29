-- The mood a user picked on entry (see lib/vibes.ts). Ephemeral like the
-- rest of the row: gone when the session ends.
ALTER TABLE "Presence" ADD COLUMN "vibe" TEXT NOT NULL DEFAULT 'chat';
