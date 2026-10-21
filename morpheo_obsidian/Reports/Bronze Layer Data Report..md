## Contribution Transaction Link

  

| Field | Value |

|-------|-------|

| **ID** | 534ead1b0043932ee1ebb401081f334d |

| **Parent Source** | CRM |

| **Description** | Links contribution transactions to their respective details. |

| **Primary Key** | transaction_id |

| **Foreign Keys** | constituent_id, customer_no, order_id, appeal_no, promotion_appeal, batch_id |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Deceased Cont W Last Activity | via `customer_no` |

| → Packages | via `order_id` |

| → Contribution Output | via `contribution_id` |

| → batchsummary | via `batch_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| **Primary Keys Referenced By** | |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → production season types | via `transaction_id` |

| → batchsummary | via `transaction_id` |

| → Ticket | via `transaction_id` |

| → Funds | via `transaction_id` |

| → members | via `transaction_id` |

| → Ticket Seat Id | via `transaction_id` |

| → Deceased Cont W Last Activity | via `transaction_id` |

| → Contact Types Relationships | via `transaction_id` |

| → Contribution Output | via `transaction_id` |

| → events | via `transaction_id` |

| → pseudonymous users | via `transaction_id` |

  

---

  

## Promo Quarterly

  

| Field | Value |

|-------|-------|

| **ID** | 880c94f9e41c72a127590d7fffdb370d |

| **Parent Source** | CRM |

| **Description** | Stores promotional campaign data on a quarterly basis. |

| **Primary Key** | promotion_appeal |

| **Foreign Keys** | customer_no |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Deceased Cont W Last Activity | via `customer_no` |

| **Primary Keys Referenced By** | |

| → Packages | via `appeal_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Ticket | via `appeal_id` |

| → members | via `appeal_id` |

| → Contribution Output | via `appeal_id` |

| → Contribution Transaction Link | via `promotion_appeal` |

| → Packages | via `promotion_appeal` |

| → Appeal Source Structure | via `promotion_appeal` |

| → production season types | via `promotion_appeal` |

| → batchsummary | via `promotion_appeal` |

| → Deferrals and Receiveables Not in Model Yet | via `promotion_appeal` |

| → Ticket | via `promotion_appeal` |

| → Funds | via `promotion_appeal` |

| → Ticket Seat Id | via `promotion_appeal` |

| → Contact Types Relationships | via `promotion_appeal` |

| → Contribution Output | via `promotion_appeal` |

  

---

  

## dimconstituentsanon

  

| Field | Value |

|-------|-------|

| **ID** | e2d3f32dfb61d34aa3060f6cb4ce6f77 |

| **Parent Source** | CRM |

| **Description** | A dimension table containing anonymous constituent information. |

| **Primary Key** | constituent_id |

| **Foreign Keys** | constituent_id |

| **Foreign Keys Referencing Tables** | |

| → Contribution Output | via `constituent_id` |

| → Ticket | via `constituent_id` |

| → Packages | via `constituent_id` |

| **Primary Keys Referenced By** | |

| → Packages | via `constituent_id` |

| → Appeal Source Structure | via `constituent_id` |

| → production season types | via `constituent_id` |

| → batchsummary | via `constituent_id` |

| → members | via `constituent_id` |

| → Deceased Cont W Last Activity | via `constituent_id` |

| → Contact Types Relationships | via `constituent_id` |

| → Contribution Output | via `constituent_id` |

| → events | via `constituent_id` |

| → pseudonymous users | via `constituent_id` |

  

---

  

## Appeal Source Structure

  

| Field | Value |

|-------|-------|

| **ID** | 56e84cd62d98d48a23850f5165baf071 |

| **Parent Source** | CRM |

| **Description** | Structure for managing appeal sources within the CRM system. |

| **Primary Key** | appeal_no |

| **Foreign Keys** | promotion_appeal, customer_no, constituent_id |

| **Foreign Keys Referencing Tables** | |

| → Promo Quarterly | via `promotion_appeal` |

| → Contribution Output | via `appeal_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Contact Types Relationships | via `customer_no` |

| → Promo Quarterly | via `appeal_no` |

| **Primary Keys Referenced By** | |

| → Ticket | via `appeal` |

| → Packages | via `appeal_id` |

| → members | via `appeal` |

| → Contribution Transaction Link | via `appeal_no` |

| → production season types | via `appeal_no` |

| → batchsummary | via `appeal_no` |

| → Deferrals and Receiveables Not in Model Yet | via `appeal_no` |

| → Ticket | via `appeal_no` |

| → Funds | via `appeal_no` |

| → members | via `appeal_no` |

| → Ticket Seat Id | via `appeal_no` |

| → Deceased Cont W Last Activity | via `appeal_no` |

| → Contact Types Relationships | via `appeal_no` |

| → Contribution Output | via `appeal_no` |

  

---

  

## production season types

  

| Field | Value |

|-------|-------|

| **ID** | 48527682c3aaedf9b960b951869c9d67 |

| **Parent Source** | CRM |

| **Description** | Table containing types of production seasons. |

| **Primary Key** | production_season_id |

| **Foreign Keys** | promotion_appeal, batch_id, customer_no, order_id, transaction_id, constituent_id, appeal_no |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Deceased Cont W Last Activity | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Packages | via `order_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Contribution Output | via `constituent_id` |

| → batchsummary | via `batch_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| **Primary Keys Referenced By** | |

| → Ticket | via `production_season_id` |

| → members | via `membership_id` |

| → Ticket Seat Id | via `performance_id` |

| → batchsummary | via `production_season_id` |

| → Deferrals and Receiveables Not in Model Yet | via `production_season_id` |

| → Ticket Seat Id | via `production_season_id` |

| → Contact Types Relationships | via `production_season_id` |

| → Contribution Output | via `production_season_id` |

| → events | via `production_season_id` |

  

---

  

## Packages

  

| Field | Value |

|-------|-------|

| **ID** | 34aff2970f6552ee316eb546c6c258ca |

| **Parent Source** | CRM |

| **Description** | Table containing information about various packages associated with orders. |

| **Primary Key** | order_id |

| **Foreign Keys** | customer_no, promotion_appeal, constituent_id |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Deceased Cont W Last Activity | via `customer_no` |

| → dimconstituentsanon | via `constituent_id` |

| → Contribution Output | via `constituent_id` |

| → Promo Quarterly | via `promotion_appeal` |

| → Promo Quarterly | via `appeal_id` |

| → Appeal Source Structure | via `appeal_id` |

| **Primary Keys Referenced By** | |

| → Ticket | via `order_id` |

| → Ticket Seat Id | via `order_id` |

| → Contribution Transaction Link | via `order_id` |

| → dimconstituentsanon | via `constituent_id` |

| → production season types | via `order_id` |

| → batchsummary | via `order_id` |

| → Deferrals and Receiveables Not in Model Yet | via `order_id` |

| → Funds | via `order_id` |

| → members | via `order_id` |

| → Deceased Cont W Last Activity | via `order_id` |

| → Contact Types Relationships | via `order_id` |

| → Contribution Output | via `order_id` |

| → events | via `order_id` |

  

---

  

## Funds

  

| Field | Value |

|-------|-------|

| **ID** | 31424eefa1b227d0bd93c9c0d3603f45 |

| **Parent Source** | CRM |

| **Description** | This table stores information related to funds and their associated transactions. |

| **Primary Key** | cont_designation_id |

| **Foreign Keys** | appeal_no, constituent_id, transaction_id, customer_no, membership_id, order_id, production_season_id, batch_id, ticket_id, seat_id, promotion_appeal |

| **Foreign Keys Referencing Tables** | |

| → Contribution Transaction Link | via `transaction_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Contribution Output | via `fund_id` |

| → Contact Types Relationships | via `customer_no` |

| → Packages | via `order_id` |

| → Ticket | via `ticket_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| → members | via `membership_id` |

| **Primary Keys Referenced By** | |

| → Deceased Cont W Last Activity | via `cont_designation_id` |

| → Contact Types Relationships | via `cont_designation_id` |

| → Contribution Output | via `cont_designation_id` |

  

---

  

## Contribution Output

  

| Field | Value |

|-------|-------|

| **ID** | a1934e6d3781bed388dc8dd7cb4aecc4 |

| **Parent Source** | CRM |

| **Description** | Records the contributions made by constituents. |

| **Primary Key** | constituent_id |

| **Foreign Keys** | cont_designation_id, constituent_id, transaction_id, customer_no, promotion_appeal, batch_id, appeal_no, production_season_id, ticket_id, membership_id, seat_id, order_id |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → production season types | via `production_season_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Ticket Seat Id | via `seat_id` |

| → Ticket | via `ticket_id` |

| → Packages | via `order_id` |

| → Funds | via `cont_designation_id` |

| → dimconstituentsanon | via `constituent_id` |

| → members | via `membership_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| → Promo Quarterly | via `appeal_id` |

| → Ticket | via `constituent_id` |

| → members | via `constituent_id` |

| → Ticket Seat Id | via `constituent_id` |

| **Primary Keys Referenced By** | |

| → Contribution Transaction Link | via `contribution_id` |

| → Packages | via `constituent_id` |

| → Appeal Source Structure | via `appeal_id` |

| → dimconstituentsanon | via `constituent_id` |

| → production season types | via `constituent_id` |

| → Deferrals and Receiveables Not in Model Yet | via `constituent_id` |

| → Funds | via `fund_id` |

| → Deceased Cont W Last Activity | via `constituent_id` |

| → Contact Types Relationships | via `constituent_id` |

| → events | via `constituent_id` |

| → pseudonymous users | via `constituent_id` |

  

---

  

## Deceased Cont W Last Activity

  

| Field | Value |

|-------|-------|

| **ID** | 4cb3544c21d1881216a12ebf8b4060ec |

| **Parent Source** | CRM |

| **Description** | This table contains records of deceased customers along with their last activity dates. |

| **Primary Key** | customer_no |

| **Foreign Keys** | ticket_id, order_id, constituent_id, seat_id, customer_no, transaction_id, cont_designation_id |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Ticket Seat Id | via `seat_id` |

| → Packages | via `order_id` |

| → Ticket | via `ticket_id` |

| → Funds | via `cont_designation_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Contribution Output | via `constituent_id` |

| → Appeal Source Structure | via `appeal_no` |

| **Primary Keys Referenced By** | |

| → Promo Quarterly | via `customer_no` |

| → Contribution Transaction Link | via `customer_no` |

| → Packages | via `customer_no` |

| → production season types | via `customer_no` |

| → Deferrals and Receiveables Not in Model Yet | via `customer_no` |

| → members | via `customer_no` |

| → Ticket Seat Id | via `customer_no` |

| → Contact Types Relationships | via `customer_no` |

  

---

  

## Contact Types Relationships

  

| Field | Value |

|-------|-------|

| **ID** | cca1a21794505a661a41bb18a6308170 |

| **Parent Source** | CRM |

| **Description** | This table captures the various types of relationships associated with customers. |

| **Primary Key** | customer_no |

| **Foreign Keys** | customer_no, constituent_id, production_season_id, promotion_appeal, batch_id, membership_id, ticket_id, order_id, appeal_no, transaction_id, seat_id, cont_designation_id |

| **Foreign Keys Referencing Tables** | |

| → Deceased Cont W Last Activity | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → production season types | via `production_season_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Ticket Seat Id | via `seat_id` |

| → Ticket | via `ticket_id` |

| → Packages | via `order_id` |

| → Funds | via `cont_designation_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Contribution Output | via `constituent_id` |

| → batchsummary | via `batch_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| → members | via `membership_id` |

| **Primary Keys Referenced By** | |

| → Contribution Transaction Link | via `customer_no` |

| → Promo Quarterly | via `customer_no` |

| → Packages | via `customer_no` |

| → Appeal Source Structure | via `customer_no` |

| → production season types | via `customer_no` |

| → Deferrals and Receiveables Not in Model Yet | via `customer_no` |

| → Ticket | via `customer_no` |

| → Funds | via `customer_no` |

| → members | via `customer_no` |

| → Ticket Seat Id | via `customer_no` |

| → Deceased Cont W Last Activity | via `customer_no` |

| → Contribution Output | via `customer_no` |

| → events | via `customer_no` |

| → users | via `customer_no` |

  

---

  

## Deferrals and Receiveables Not in Model Yet

  

| Field | Value |

|-------|-------|

| **ID** | e1be0e9d1bc54006abe53dcfaff8a7e1 |

| **Parent Source** | CRM |

| **Description** | This table captures deferrals and receivables that are not yet included in the financial model. |

| **Primary Key** | transaction_id |

| **Foreign Keys** | batch_id, transaction_id, constituent_id, production_season_id, customer_no, order_id, appeal_no, promotion_appeal |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → Deceased Cont W Last Activity | via `customer_no` |

| → production season types | via `production_season_id` |

| → Packages | via `order_id` |

| → Ticket | via `transaction_id` |

| → Contribution Output | via `constituent_id` |

| → batchsummary | via `batch_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| **Primary Keys Referenced By** | |

| → production season types | via `transaction_id` |

| → Ticket | via `transaction_id` |

| → Funds | via `transaction_id` |

| → Deceased Cont W Last Activity | via `transaction_id` |

| → Contact Types Relationships | via `transaction_id` |

| → Contribution Output | via `transaction_id` |

| → events | via `transaction_id` |

| → pseudonymous users | via `transaction_id` |

  

---

  

## members

  

| Field | Value |

|-------|-------|

| **ID** | 05aa1e68e77af4f01193c14263d27f43 |

| **Parent Source** | CRM |

| **Description** | Table containing member information and their associated membership details. |

| **Primary Key** | membership_id |

| **Foreign Keys** | production_season_id, seat_id, constituent_id, ticket_id, order_id, batch_id, transaction_id, customer_no, appeal_no, promotion_appeal |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → Ticket Seat Id | via `seat_id` |

| → Ticket | via `ticket_id` |

| → Packages | via `order_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Deceased Cont W Last Activity | via `customer_no` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `appeal_id` |

| → Appeal Source Structure | via `appeal` |

| → production season types | via `membership_id` |

| → users | via `membership_id` |

| **Primary Keys Referenced By** | |

| → Contribution Output | via `constituent_id` |

| → Funds | via `membership_id` |

| → Contact Types Relationships | via `membership_id` |

| → Contribution Output | via `membership_id` |

| → events | via `membership_id` |

  

---

  

## users

  

| Field | Value |

|-------|-------|

| **ID** | 9bc65c2abec141778ffaa729489f3e87 |

| **Parent Source** | GA4 |

| **Description** | Table containing user data collected from GA4. |

| **Primary Key** | user_id |

| **Foreign Keys** | pseudo_user_id, customer_no, event_bundle_sequence_id |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → pseudonymous users | via `pseudo_user_id` |

| → events | via `event_bundle_sequence_id` |

| **Primary Keys Referenced By** | |

| → members | via `membership_id` |

| → pseudonymous users | via `user_id` |

  

---

  

## pseudonymous users

  

| Field | Value |

|-------|-------|

| **ID** | d56ce9c6b9bd0f5600449feaac6290b1 |

| **Parent Source** | GA4 |

| **Description** | Stores information about pseudonymous users interacting with the GA4 platform. |

| **Primary Key** | pseudo_user_id |

| **Foreign Keys** | user_id, event_bundle_sequence_id, transaction_id, batch_id, constituent_id, seat_id, ticket_id |

| **Foreign Keys Referencing Tables** | |

| → Contribution Transaction Link | via `transaction_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → events | via `event_bundle_sequence_id` |

| → Ticket Seat Id | via `seat_id` |

| → Ticket | via `ticket_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Contribution Output | via `constituent_id` |

| → batchsummary | via `batch_id` |

| → users | via `user_id` |

| **Primary Keys Referenced By** | |

| → users | via `pseudo_user_id` |

  

---

  

## batchsummary

  

| Field | Value |

|-------|-------|

| **ID** | fbc6e5b24dd857869918a3ed39527d1f |

| **Parent Source** | CRM |

| **Description** | Summary of batches processed in the CRM system. |

| **Primary Key** | batch_id |

| **Foreign Keys** | production_season_id, transaction_id, constituent_id, customer_no, order_id, appeal_no, promotion_appeal |

| **Foreign Keys Referencing Tables** | |

| → production season types | via `production_season_id` |

| → Contribution Transaction Link | via `transaction_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Packages | via `order_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| **Primary Keys Referenced By** | |

| → Deferrals and Receiveables Not in Model Yet | via `batch_id` |

| → events | via `batch_page_id` |

| → events | via `batch_ordering_id` |

| → Contribution Transaction Link | via `batch_id` |

| → production season types | via `batch_id` |

| → Contact Types Relationships | via `batch_id` |

| → events | via `batch_id` |

| → pseudonymous users | via `batch_id` |

  

---

  

## Ticket

  

| Field | Value |

|-------|-------|

| **ID** | f1c790944ccb6fb41f71489900ec4f6d |

| **Parent Source** | CRM |

| **Description** | Table containing ticket information for events. |

| **Primary Key** | ticket_id |

| **Foreign Keys** | seat_id, order_id, production_season_id, transaction_id, constituent_id, customer_no, batch_id, promotion_appeal, appeal_no |

| **Foreign Keys Referencing Tables** | |

| → Ticket Seat Id | via `seat_id` |

| → Contribution Transaction Link | via `transaction_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Contact Types Relationships | via `customer_no` |

| → Packages | via `order_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| → Promo Quarterly | via `appeal_id` |

| → Appeal Source Structure | via `appeal` |

| → production season types | via `production_season_id` |

| → Ticket Seat Id | via `ticket_id` |

| **Primary Keys Referenced By** | |

| → Contribution Output | via `constituent_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Funds | via `ticket_id` |

| → members | via `ticket_id` |

| → Deceased Cont W Last Activity | via `ticket_id` |

| → Contact Types Relationships | via `ticket_id` |

| → Contribution Output | via `ticket_id` |

| → events | via `ticket_id` |

| → pseudonymous users | via `ticket_id` |

  

---

  

## Ticket Seat Id

  

| Field | Value |

|-------|-------|

| **ID** | 88413cb2ffc5d0be5506f90842fa09a8 |

| **Parent Source** | CRM |

| **Description** | Table containing information about ticket seats. |

| **Primary Key** | seat_id |

| **Foreign Keys** | order_id, transaction_id, batch_id, customer_no, production_season_id, constituent_id, promotion_appeal, appeal_no, ticket_id |

| **Foreign Keys Referencing Tables** | |

| → Contact Types Relationships | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → Deceased Cont W Last Activity | via `customer_no` |

| → production season types | via `production_season_id` |

| → Packages | via `order_id` |

| → Appeal Source Structure | via `appeal_no` |

| → Promo Quarterly | via `promotion_appeal` |

| → production season types | via `performance_id` |

| **Primary Keys Referenced By** | |

| → Ticket | via `ticket_id` |

| → Contribution Output | via `constituent_id` |

| → Ticket | via `seat_id` |

| → members | via `seat_id` |

| → Deceased Cont W Last Activity | via `seat_id` |

| → Contact Types Relationships | via `seat_id` |

| → Contribution Output | via `seat_id` |

| → pseudonymous users | via `seat_id` |

  

---

  

## events

  

| Field | Value |

|-------|-------|

| **ID** | 16908b0605f2645dfcb4c3a8d248cef3 |

| **Parent Source** | GA4 |

| **Description** | This table stores event data collected from GA4. |

| **Primary Key** | event_bundle_sequence_id |

| **Foreign Keys** | batch_id, transaction_id, order_id, production_season_id, seat_id, ticket_id, constituent_id, user_id, membership_id, customer_no |

| **Foreign Keys Referencing Tables** | |

| → batchsummary | via `batch_id` |

| → Deferrals and Receiveables Not in Model Yet | via `transaction_id` |

| → Contact Types Relationships | via `customer_no` |

| → Contribution Transaction Link | via `transaction_id` |

| → production season types | via `production_season_id` |

| → Packages | via `order_id` |

| → Ticket | via `ticket_id` |

| → dimconstituentsanon | via `constituent_id` |

| → Contribution Output | via `constituent_id` |

| → members | via `membership_id` |

| → batchsummary | via `batch_page_id` |

| → batchsummary | via `batch_ordering_id` |

| **Primary Keys Referenced By** | |

| → users | via `event_bundle_sequence_id` |

| → pseudonymous users | via `event_bundle_sequence_id` |




