# Migration Notes

ServEase uses one Supabase database with one schema per service. Application
code must only read and write the schema owned by its service; cross-service
data access goes through Kafka RPC.

The provider screening trigger `provider_catalog.sync_user_is_verified()` is
the only intentional schema-boundary exception. It is a database-level
consistency guarantee that mirrors `provider_profiles.verification_status` to
`identity_and_user.users.is_verified` and `verification_status` when a provider
application decision changes. Do not add application-code cross-schema writes to
replace or extend this trigger.
