-- Temporary column for BrightSpot VideoPage title preservation across a
-- broadcast — see api/encoder-go-live.js: publishToBrightSpot captures the
-- video page's current title here before overwriting it with the broadcast
-- title, so encoder-stop.js can restore it. Named "_headline" (not
-- "_subheadline") because the field currently mapped for testing
-- (subHeadline) will eventually be replaced by the real Headline field —
-- this column's business meaning won't need to change when that happens.
alter table encoders add column if not exists brightspot_original_headline text;
