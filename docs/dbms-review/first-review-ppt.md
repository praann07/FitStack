# FitStack — DBMS (22AIE303) First Project Review

**Project:** FitStack — Unified Training, Nutrition & Progress Tracker  
**Course:** 22AIE303 — Database Management Systems  
**Review Stage:** First Review  
**Stack:** PostgreSQL 15+ (Supabase Managed Engine), PostgREST, Row Level Security (RLS), React 19, TypeScript, Vite, Tailwind CSS  

---

## Executive Summary & System Evolution
Between the Zeroth Review and the First Review, FitStack has completed its full database migration and hardened its two-tier relational architecture:
1. **12 Relational Tables** deployed and operational on PostgreSQL via 8 versioned migrations.
2. **Database-Enforced Security:** Implemented Row Level Security (RLS) across every table with `(SELECT auth.uid())` InitPlan subquery caching for $O(1)$ query evaluation.
3. **Automated Provisioning:** Synchronous PL/pgSQL trigger `handle_new_user()` executing on `AFTER INSERT ON auth.users`.
4. **Referential Robustness:** Domain `CHECK` constraints, composite `UNIQUE (user_id, log_date)`, and `ON DELETE SET NULL` on routine references to safeguard workout history.
5. **Real-World Bug Resolution:** Discovered and resolved the **Migration 0008 signup deadlock**, proving live end-to-end database testing.

---

## Relational Schema Specification

```
profiles(id PK → auth.users.id, full_name, goal, goal_rate_kg_week, height_cm, onboarded, approved, created_at)
exercises(id PK, name, muscle_group, equipment, is_custom, created_by → auth.users.id)
routines(id PK, user_id → auth.users.id, name, notes, created_at, updated_at)
routine_exercises(id PK, routine_id → routines.id, exercise_id → exercises.id, order_index, target_sets, target_rep_range, target_rpe, rest_seconds, notes)
workout_sessions(id PK, user_id → auth.users.id, routine_id → routines.id, session_date, notes, started_at, ended_at)
workout_sets(id PK, session_id → workout_sessions.id, exercise_id → exercises.id, set_number, weight_kg, reps, rpe, set_type, notes, is_pr)
foods(id PK, name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, serving_label, serving_g, is_custom, created_by → auth.users.id)
food_logs(id PK, user_id → auth.users.id, food_id → foods.id, log_date, quantity_g, meal_type)
body_metrics(id PK, user_id → auth.users.id, log_date, weight_kg, waist_cm, chest_cm, arm_cm, photo_url, UNIQUE(user_id, log_date))
nutrition_targets(id PK, user_id → auth.users.id, effective_date, calories, protein_g, carbs_g, fat_g, source)
tdee_estimates(id PK, user_id → auth.users.id, estimate_date, estimated_tdee, weight_trend_kg, confidence)
dismissed_suggestions(id PK, user_id → auth.users.id, suggestion_id, created_at)
```

---

## 15-Slide Presentation Blueprint

### Slide 1 — Title & Overview
* **Headline:** FitStack: Unified Training, Nutrition & Progress Tracker
* **Focus:** 22AIE303 First Review; PostgreSQL-centric relational database unifying fragmented fitness domains.
* **Speaker Script:** "Good morning panel. FitStack replaces disconnected fitness apps with an ACID-compliant PostgreSQL database that enforces data isolation at the engine level and powers cross-domain derivation."

### Slide 2 — Problem Statement & Domain Realities
* **Headline:** Data Silos, Redundancy & Static Targets
* **Focus:** Existing apps isolate workouts, nutrition, and weight. Target formulas remain static rather than adapting to true energy expenditure ($TDEE$).
* **Speaker Script:** "Because existing apps do not share a database, nutritional planning cannot see training volume or true weight trends. FitStack unifies them under one schema."

### Slide 3 — Existing vs. Proposed System
* **Headline:** Architecture & Integrity Comparison
* **Focus:** Comparison table highlighting PostgreSQL ACID compliance, RLS vs client-side checks, and cascading integrity.
* **Speaker Script:** "Unlike conventional apps that rely on fragile client-side validation, FitStack guarantees relational integrity and security directly inside PostgreSQL."

### Slide 4 — Project Objectives & Scope
* **Headline:** Engineering Objectives
* **Focus:** 3NF schema design, RLS data isolation, PL/pgSQL triggers, composite indexing, and cross-domain analytical queries.
* **Speaker Script:** "Our primary objective is to engineer a resilient relational foundation with automated user provisioning and multi-tenant security."

### Slide 5 — System & Data Architecture
* **Headline:** 2-Tier Direct-to-PostgreSQL Architecture
* **Focus:** Client (React 19 SPA) $\to$ PostgREST + GoTrue Auth $\to$ PostgreSQL 15+.
* **Speaker Script:** "We eliminated intermediary server vulnerabilities: authorization is evaluated by PostgreSQL on every query via JWT claims."

### Slide 6 — Requirements Analysis
* **Headline:** Functional & Non-Functional Database Specifications
* **Focus:** FR1–FR5 (workout logs, food entries, biometrics) and NFR1–NFR4 (isolation, integrity, <50ms query latency).
* **Speaker Script:** "Our requirements mandate strict referential actions, zero cross-user data leakage, and fast indexed range queries."

### Slide 7 — Conceptual Design: 12-Entity ER Model
* **Headline:** Entity-Relationship Diagram & Cardinalities
* **Focus:** Complete 12-entity ER diagram illustrating 1:1, 1:N, and associative entities (`routine_exercises`, `workout_sets`).
* **Speaker Script:** "The ER model isolates entities cleanly: associative tables record historical performance without polluting template definitions."

### Slide 8 — Logical Design: Relational Schema & Constraints
* **Headline:** Table Definitions & Referential Actions
* **Focus:** Underlined PKs, FK bindings, `ON DELETE CASCADE`, `ON DELETE SET NULL`, and `CHECK` constraints.
* **Speaker Script:** "Deleting routine templates sets workout session references to NULL, preserving past workout history."

### Slide 9 — Schema Normalization: 1NF to 3NF Proof
* **Headline:** Formal Proof of Normalization
* **Focus:** Functional dependencies in food logging: $\text{id} \to \text{food\_id} \to \text{calories\_per\_100g}$ decomposed to eliminate transitive dependencies and update anomalies.
* **Speaker Script:** "By decomposing foods and food logs, macro totals are calculated dynamically at read time, guaranteeing Third Normal Form."

### Slide 10 — Advanced DBMS Features: Triggers & RLS Gate
* **Headline:** PL/pgSQL Triggers & Security Definer Functions
* **Focus:** `on_auth_user_created` trigger executing `handle_new_user()`, execution revocation, and pilot approval gate.
* **Speaker Script:** "We automated profile creation via database triggers and hardened security by revoking public execute privileges."

### Slide 11 — SQL Performance: Indexes & InitPlan Subqueries
* **Headline:** B-Tree Indexing & InitPlan Optimization
* **Focus:** Wrapping `(SELECT auth.uid())` for $O(1)$ query evaluation; composite B-Tree indexes on temporal columns.
* **Speaker Script:** "We optimized RLS policies from $O(N)$ row evaluations to $O(1)$ InitPlan subqueries with indexed foreign keys."

### Slide 12 — Analytical Queries & Aggregations
* **Headline:** Volume Aggregation & Nutritional Derivation
* **Focus:** 3-table join for weekly training volume (`SUM(weight * reps) GROUP BY muscle_group`) and daily macro totals.
* **Speaker Script:** "These queries demonstrate complex joins and groupings directly supporting our frontend dashboard."

### Slide 13 — Current Implementation & Live Results
* **Headline:** 100% Schema Deployment & Verification Evidence
* **Focus:** 8 applied migrations, verified signup triggers, RLS penetration testing, and live CRUD operations.
* **Speaker Script:** "All 8 migrations are live on PostgreSQL. We verified trigger execution, RLS blocking, and mathematical accuracy on live data."

### Slide 14 — Testing & Defect Resolution Matrix
* **Headline:** Verification Matrix & Migration 0008 Resolution
* **Focus:** Test cases TC-01 through TC-05; identification and fix for the Migration 0008 signup deadlock.
* **Speaker Script:** "Live testing uncovered an RLS deadlock on initial signup, which we diagnosed and resolved in Migration 0008."

### Slide 15 — Progress, Remaining Work & Future Scope
* **Headline:** Progress Breakdown & Review 2 Roadmap
* **Focus:** 100% DB complete; Pilot rollout in progress; upcoming PostgreSQL Materialized Views for long-term historical volume.
* **Speaker Script:** "With the database foundation complete, our next milestone is public pilot onboarding and database materialized views."

---

## Reviewer Defense Q&A Summary
* **Why 2-Tier with RLS?** Eliminates application-layer IDOR bugs by enforcing security at the database engine level.
* **Why 3NF?** Avoids redundancy and update anomalies; macros are derived dynamically via joins.
* **Why UUIDs?** Anti-enumeration security and collision-free client-side ID generation.
* **Why `ON DELETE SET NULL` on routines?** Deleting routine templates preserves historical workout session data.
* **What was the Migration 0008 fix?** Decoupled seed tables (`body_metrics`, `nutrition_targets`) from the approval gate to prevent signup deadlocks.
