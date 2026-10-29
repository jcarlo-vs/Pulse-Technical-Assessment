-- Who this session is paired with: the target of a pending outgoing request,
-- or the partner of an active connection (busy = true). Lets the API enforce
-- that signaling only flows between two sessions that agreed to connect.
ALTER TABLE "Presence" ADD COLUMN "peerId" TEXT;
