# Security Architecture, Threat Model & Regulatory Checklist

**System:** Amrutam Telemedicine Backend  
**Security Clearance:** Healthcare Data Compliance (DISHA - India, HIPAA, ISO 27001)  
**Classification:** Mission-Critical Healthcare Infrastructure  

---

## 1. Data Classification Matrix

| Classification Level | Definition | Examples | Storage Controls | Transit Controls | Access Control |
|---|---|---|---|---|---|
| **PHI / Highly Confidential** | Protected Health Information directly linked to individual patient health | Clinical diagnosis, prescription medications, clinical notes, doctor observations | Encrypted via **AES-256-GCM** at column level + KMS CMK | TLS 1.3 (Strict HSTS) | Strict RBAC (Only assigned Doctor and Patient; Admin blinded) |
| **PII / Confidential** | Personally Identifiable Information | Patient email, phone, date of birth, blood group, emergency contact | Encrypted at rest (AWS RDS KMS), bcrypt password hash (cost 12) | TLS 1.3 | Authenticated user profile owner, Admin |
| **Internal Sensitive** | Financial & Operational data | Payment transaction IDs, revenue aggregates, audit logs, idempotency records | Partitioned RDS storage, immutable append-only logs | TLS 1.3 | Admin role only |
| **Public** | Publicly accessible medical information | Doctor profiles, verified specialties, years of experience, public ratings, available slot timings | Redis cache & Aurora Read Replicas | HTTPS / Cloudflare CDN | Public read access |

---

## 2. STRIDE Threat Modeling Analysis

We performed comprehensive STRIDE threat modeling across the Telemedicine API surface:

| STRIDE Category | Specific Threat in Telemedicine | Impact | Engineering Mitigation in Amrutam |
|---|---|---|---|
| **Spoofing (Identity)** | Malicious actor generates fake doctor identity or steals patient token | Attacker attends consultation, accesses sensitive medical records | • Mandatory **RFC 6238 TOTP Multi-Factor Authentication** for doctors and admins<br>• Short-lived JWT access tokens (1 hour) with cryptographic signing<br>• Refresh token rotation with IP/User-Agent tracking |
| **Tampering (Data)** | Attacker intercepts or modifies prescription after consultation to alter drug dosage | Patient receives incorrect medication, severe clinical risk | • Cryptographic **HMAC-SHA256 Digital Signature** computed across doctor ID, patient ID, diagnosis, and medications<br>• Signatures verified on every prescription view<br>• Immutable audit log of all changes |
| **Repudiation** | Doctor denies issuing a prescription or patient denies booking a consultation | Legal disputes, compliance violation under DISHA | • **Immutable Partitioned Audit Logs** recording User ID, Action, Entity, Timestamp, IP Address, and User-Agent<br>• Append-only database partition; no update/delete grants permitted |
| **Information Disclosure** | Data breach of database backups or database dump exposes sensitive clinical history | Massive privacy violation, regulatory penalties | • **AES-256-GCM column-level encryption** with unique 96-bit initialization vectors (IV) for clinical notes<br>• Database at rest encryption via AWS KMS<br>• Automated PII/PHI redaction in Winston structured logs |
| **Denial of Service** | Botnet floods slot booking endpoint or searches 100k times/second | System downtime, legitimate patients unable to book urgent care | • Sliding window **Rate Limiting** (100 req/min for general routes, 20 req/min for auth)<br>• Cloudflare L3/L4/L7 DDoS protection<br>• Two-tier caching (L1 process memory + L2 Redis) absorbing 95% of search reads |
| **Elevation of Privilege** | Patient manipulates consultation ID parameter to view other patients' records (BOLA / IDOR) | Unauthorized access to medical records of other users | • **Granular RBAC Middleware** verifying that the authenticated user ID strictly matches `patient_id` or `doctor_id` of the record<br>• Role checks enforce patient, doctor, and admin privilege boundaries |

---

## 3. OWASP Top 10 API Security Mitigations

### 1. Broken Object Level Authorization (BOLA / IDOR)
- **Mitigation:** Never rely on route parameters alone. The `ConsultationService` and `PrescriptionService` explicitly compare `req.user.userId` against the record's ownership before returning clinical data. 403 Forbidden is returned on mismatch.

### 2. Broken Authentication
- **Mitigation:** Passwords hashed with bcrypt (cost factor 12). Full support for RFC 6238 TOTP 2FA. Brute force rate limiting (20 attempts / minute per IP).

### 3. Broken Object Property Level Authorization (Mass Assignment)
- **Mitigation:** Strict request schema validation via **Zod**. Extra or unexpected fields are stripped or rejected at the HTTP boundary before reaching domain services.

### 4. Unrestricted Resource Consumption (DoS / Rate Limiting)
- **Mitigation:** Multi-tiered rate limiters with `X-RateLimit-*` and `Retry-After` headers. Database connection pooling configured with tight acquisition timeouts (2000ms).

### 5. Broken Function Level Authorization (BFLA)
- **Mitigation:** Declarative RBAC middleware (`authorize(UserRole.ADMIN)`) protecting all administrative, analytical, and audit trail endpoints.

### 6. Unrestricted Access to Sensitive Business Flows (Double-Booking & Race Conditions)
- **Mitigation:** Redlock distributed locks + PostgreSQL `SELECT ... FOR UPDATE` + Optimistic concurrency locking (`version INT`). Idempotency key middleware guaranteeing exactly-once write execution.

### 7. Server-Side Request Forgery (SSRF)
- **Mitigation:** Webhook workers only dispatch to pre-whitelisted internal gateways or verified HTTPS endpoints with strict DNS resolution checks.

### 8. Security Misconfiguration
- **Mitigation:** Helmet security headers configured (HSTS, X-Content-Type-Options: nosniff, Frameguard, Referrer-Policy). Non-root Docker user (`appuser`). Production error handler hides stack traces.

### 9. Improper Inventory Management
- **Mitigation:** Automatic OpenAPI 3.0 contract generation with Swagger UI at `/api-docs` and versioned API route prefixes (`/api/v1`).

### 10. Unsafe Consumption of APIs
- **Mitigation:** Strict schema verification on all third-party webhook inputs and TLS 1.3 encryption for external payment gateway communication.

---

## 4. Encryption & Key Management

### Encryption in Transit:
- **Protocol:** TLS 1.3 with forward secrecy (ECDHE-RSA-AES256-GCM-SHA384).
- **Enforcement:** HTTP Strict Transport Security (HSTS) with `max-age=31536000; includeSubDomains; preload`.

### Encryption at Rest:
- **Database & Cache:** AWS Aurora PostgreSQL and ElastiCache Redis encrypted with dedicated AWS KMS Customer Managed Keys (CMK).
- **Application Column-Level Encryption:** Field `clinical_notes_encrypted` in table `consultations` uses AES-256-GCM with a 256-bit key and 128-bit authentication tag. Protects patient data even in the event of an unauthorized database dump!

### Key Rotation Policy:
- AWS KMS keys configured with **automated annual rotation**.
- Master encryption keys and JWT secrets injected at container runtime via Kubernetes Secrets / AWS Secrets Manager.
- Zero secrets committed to source control (`.gitignore` enforces `.env` exclusion).

---

## 5. Security Checklist (Pre-Deployment Audit)

- [x] **Authentication:** Passwords hashed with bcrypt (cost 12), JWT with short expiration.
- [x] **MFA:** RFC 6238 TOTP support with QR code provisioning and backup verification.
- [x] **RBAC:** Explicit role validation (Patient, Doctor, Admin) on every protected endpoint.
- [x] **BOLA/IDOR Prevention:** Strict ownership verification on patient records and prescriptions.
- [x] **Idempotency:** Exactly-once semantics implemented with `Idempotency-Key` header and payload collision detection.
- [x] **Concurrency Locking:** Redlock distributed lock + DB row locks preventing double booking.
- [x] **Tamper-Proofing:** Prescriptions signed with HMAC-SHA256 digital signature.
- [x] **PHI Protection:** AES-256-GCM column encryption on clinical notes.
- [x] **PII Redaction:** Automated log masking in Winston logger for HIPAA/DISHA compliance.
- [x] **Audit Trail:** Partitioned, immutable `audit_logs` tracking every access and state change.
- [x] **Input Validation:** Comprehensive Zod validation on request bodies, queries, and parameters.
- [x] **Rate Limiting:** Sliding-window rate limiter protecting against brute-force and scraping.
- [x] **Container Hardening:** Multi-stage Dockerfile running as non-root `appuser`.
- [x] **CI/CD Security:** Automated vulnerability scanning with `npm audit` and Trivy.
