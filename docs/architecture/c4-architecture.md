# ServEase C4 Architecture

This document provides a C4-style view of the current ServEase architecture.

## Scope and Assumptions

- Backend is microservices-oriented with Kafka request/reply contracts.
- Data is a single Supabase project with schema ownership boundaries per service.
- Gateway is the single HTTP entrypoint.

## Level 1 - System Context

```mermaid
flowchart LR
  customer[Customer]
  provider[Provider]
  admin[Admin / Operations Team]

  mobile[ServEase Mobile App]
  web[ServEase Web App]
  adminWeb[ServEase Admin Web]

  platform[ServEase Platform]

  supabase[(Supabase Project)]
  kafka[(Kafka Broker)]

  customer --> mobile
  provider --> mobile
  customer --> web
  admin --> adminWeb

  mobile --> platform
  web --> platform
  adminWeb --> platform

  platform --> kafka
  platform --> supabase
```

## Level 2 - Container View

```mermaid
flowchart TB
  subgraph Client_Channels[Client Channels]
    mobile[Mobile App]
    web[Web App]
    adminWeb[Admin Web]
  end

  subgraph Backend_Platform[ServEase Backend Platform]
    gateway[API Gateway\nNestJS HTTP Ingress]
    kafka[(Kafka Broker)]

    auth[auth-service]
    booking[booking-service]
    catalog[catalog-service]
    chat[chat-service]
    customerSvc[customer-service]
    payment[payment-service]
    providerSvc[provider-service]
    notifications[notifications-service]
    support[support-service]
    trust[trust-service]
    adminSvc[admin-service]
  end

  subgraph Data_Store[Shared Data Store]
    supabase[(Supabase Project\nSchema-Per-Service Ownership)]
  end

  mobile --> gateway
  web --> gateway
  adminWeb --> gateway

  gateway <--> kafka

  auth <--> kafka
  booking <--> kafka
  catalog <--> kafka
  chat <--> kafka
  customerSvc <--> kafka
  payment <--> kafka
  providerSvc <--> kafka
  notifications <--> kafka
  support <--> kafka
  trust <--> kafka
  adminSvc <--> kafka

  auth --> supabase
  booking --> supabase
  catalog --> supabase
  chat --> supabase
  customerSvc --> supabase
  payment --> supabase
  providerSvc --> supabase
  notifications --> supabase
  support --> supabase
  trust --> supabase
  adminSvc --> supabase
```

## Service-to-Schema Ownership

- auth-service -> identity_and_user
- booking-service -> booking
- catalog-service -> provider_catalog
- chat-service -> messages
- customer-service -> identity_and_user, identity_svc
- notifications-service -> notification_and_support
- payment-service -> payment
- provider-service -> provider_catalog
- support-service -> notification_and_support
- trust-service -> trust_and_reputation, trust_svc
- admin-service -> orchestrates across contracts; schema use guarded by checks

## Level 3 - Component View (Gateway Container)

```mermaid
flowchart LR
  subgraph Gateway[API Gateway Container]
    middleware[Correlation Middleware]
    pipes[Validation Pipe]
    timeout[Timeout Interceptor]

    authCtrl[Auth + Users Controllers]
    bookingCtrl[Booking + Provider + Customer Controllers]
    adminCtrl[Admin + Support + Notifications Controllers]
    catalogCtrl[Services + Reference + Locations Controllers]
    infraCtrl[Uploads + Health Controllers]

    kafkaClient[KAFKA_CLIENT Adapter]
    reqUtil[Kafka Request Utilities]
  end

  clients[Client Apps] --> middleware --> pipes --> timeout
  timeout --> authCtrl
  timeout --> bookingCtrl
  timeout --> adminCtrl
  timeout --> catalogCtrl
  timeout --> infraCtrl

  authCtrl --> reqUtil --> kafkaClient
  bookingCtrl --> reqUtil
  adminCtrl --> reqUtil
  catalogCtrl --> reqUtil

  kafkaClient <--> kafka[(Kafka Broker)]
```

## Level 4 - Deployment View (Current)

```mermaid
flowchart TB
  subgraph Clients[User Devices]
    mobile[Mobile App]
    web[Web / Admin Browsers]
  end

  subgraph Local_or_Server_Runtime[Backend Runtime]
    gatewayProc[Gateway Process]
    svcProcs[Microservice Processes\nauth, booking, catalog, chat, customer,\npayment, provider, notifications, support, trust, admin]
    kafkaDocker[Kafka Container]
  end

  subgraph External[Managed Services]
    supabase[(Supabase Project)]
  end

  subgraph CI[GitHub Actions]
    ci[Backend CI Workflow\nstrict-env check + schema-boundary check + builds]
  end

  mobile --> gatewayProc
  web --> gatewayProc
  gatewayProc <--> kafkaDocker
  svcProcs <--> kafkaDocker
  svcProcs --> supabase
  gatewayProc --> supabase
  ci --> gatewayProc
  ci --> svcProcs
```

## Notes

- This is a full microservices architecture in service boundary and communication model.
- The remaining textbook caveat is shared physical storage (one Supabase project) instead of physically separate databases per service.
