-- Migration to fix receiver_gln values that were incorrectly stored as UUIDs.
-- This script replaces the UUID in receiver_gln with the corresponding GLN from the referenced insurer.

UPDATE swiss_insurers si
SET receiver_gln = target.gln
FROM swiss_insurers target
WHERE si.receiver_gln = target.id::text
  -- Safety check: only update if the current value looks like a UUID (36 chars)
  AND length(si.receiver_gln) = 36;
