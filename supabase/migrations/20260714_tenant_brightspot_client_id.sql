-- BrightSpot REST Management API (CMA) uses X-Client-Id / X-Client-Secret,
-- distinct from the api-key already stored for the Content Delivery API.
-- The secret is the same shared brightspot_api_key; the Client ID is new.
alter table tenants add column if not exists brightspot_client_id text;
