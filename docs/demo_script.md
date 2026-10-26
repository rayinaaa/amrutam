# 5-Minute Video Demo Script & Walkthrough

**Project:** Amrutam Telemedicine Backend  
**Duration:** Exactly 5 Minutes  
**Target Audience:** Evaluators, Lead Architects & Healthcare Engineering Directors  

---

## ⏱️ Minute-by-Minute Video Script

### [00:00 - 01:00] Architecture & High-Scale Foundations
* **Visual:** Display `docs/ARCHITECTURE.md` showing high-level Mermaid architecture diagram and Docker Compose structure.
* **Speaker Script:**
  > "Hello! Today we are demonstrating the production-grade backend for Amrutam's Telemedicine System. Engineered to handle over 100,000 daily consultations with sub-200ms read latency and sub-500ms write latency, this system is architected around Domain-Driven Design and Hexagonal principles. 
  > It includes an automated CI/CD pipeline, multi-stage Docker builds, Kubernetes manifests with HPA auto-scaling, Terraform Infrastructure as Code for Multi-AZ Aurora PostgreSQL, ElastiCache Redis, and dedicated AWS KMS keys for PHI encryption.
  > Let's start the server and explore the live system."
* **Action:** Run `npm start` (or `docker-compose up -d`) and open `http://localhost:3000/api-docs` in the browser.

---

### [01:00 - 02:00] Security, Authentication & RFC 6238 TOTP MFA
* **Visual:** Swagger UI or terminal demonstrating `/api/v1/auth/register`, `/api/v1/auth/login`, and `/api/v1/auth/mfa/setup`.
* **Speaker Script:**
  > "Security is paramount in healthcare. The system implements strict Role-Based Access Control distinguishing Patients, Doctors, and Administrators. Passwords are salted and hashed using bcrypt with cost factor 12.
  > For doctors and administrators handling clinical records, we enforce two-factor authentication compliant with RFC 6238 TOTP. When MFA is enabled, the API generates a cryptographic secret and base64 QR code compatible with Google Authenticator or 1Password. Login attempts challenge the user for a 6-digit TOTP token with sliding time window tolerance before issuing short-lived JWT access tokens."
* **Action:** Demonstrate user registration and MFA setup cURL command.

---

### [02:00 - 03:00] Doctor Scheduling & Concurrency-Safe Booking (Double-Booking Elimination)
* **Visual:** Terminal demonstrating 10 concurrent requests hitting the exact same appointment slot simultaneously.
* **Speaker Script:**
  > "A core challenge at 100k daily volume is concurrency: what happens when multiple patients attempt to book the exact same doctor appointment slot at the exact same millisecond?
  > Amrutam solves this using a two-tier locking strategy: an atomic distributed lock via Redis Redlock (SET NX PX) and PostgreSQL row-level locks (SELECT FOR UPDATE) with optimistic version tracking.
  > In addition, we implement an Idempotency-Key header on all state-modifying endpoints. If a patient retries due to a mobile network drop, the idempotency middleware recognizes the key and replays the cached confirmation without double-charging or creating a duplicate consultation. Let's run our automated concurrency stress test."
* **Action:** Run `npm test tests/integration/booking_concurrency.test.ts` showing all 10 concurrent requests handled with exactly 1 success and 9 conflict rejections.

---

### [03:00 - 04:00] Consultation Lifecycle, PHI Encryption & Tamper-Proof Prescriptions
* **Visual:** Swagger UI or Postman showing consultation state transitions and encrypted clinical notes in database.
* **Speaker Script:**
  > "Once booked, the consultation progresses through a strict state machine: SCHEDULED -> WAITING_ROOM -> IN_PROGRESS -> COMPLETED.
  > To comply with DISHA and HIPAA regulations, clinical notes and protected health information (PHI) are encrypted at the column level using AES-256-GCM with unique initialization vectors. Even if an attacker gains raw database access, patient medical history remains impenetrable.
  > When the doctor completes the consultation, they issue a prescription. The system computes a cryptographic HMAC-SHA256 digital signature over the consultation ID, doctor ID, patient ID, diagnosis, and medications. On every view, the system verifies this signature, guaranteeing mathematical tamper-proofing. Heavy tasks like PDF generation and patient notifications are offloaded asynchronously to background workers with exponential backoff and dead-letter queues."
* **Action:** Demonstrate prescription retrieval with `signatureVerification: { isValid: true, status: "VERIFIED_AUTHENTIC" }`.

---

### [04:00 - 05:00] Observability, Prometheus, Grafana & Admin Analytics
* **Visual:** Open `http://localhost:3000/metrics`, Grafana dashboard, and `/api/v1/analytics/dashboard`.
* **Speaker Script:**
  > "Observability is baked into the foundation. Every request is tagged with a correlation X-Request-Id and W3C traceparent headers for distributed tracing with OpenTelemetry.
  > The Prometheus /metrics endpoint exposes real-time telemetry, including custom request duration histograms tracking our p95 latency targets, active consultation gauges, and prevented booking conflict counters. 
  > Our Grafana dashboard gives operations teams instant visibility into QPS, error rates, and system health. Finally, an immutable audit log partitioned by date records every clinical action for regulatory compliance.
  > Amrutam's backend is scalable, reliable, secure, and ready for production deployment. Thank you!"

---

## 🛠️ Step-by-Step Executable cURL Commands for Live Demo

### 1. Check System Health & Readiness
```bash
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:3000/ready | jq .
```

### 2. Search Available Doctors (Filtered by Ayurveda, Rating, Max Fee)
```bash
curl -s "http://localhost:3000/api/v1/doctors?specialization=Ayurveda&maxFee=1000" | jq .
```

### 3. Patient Login & Obtain JWT Token
```bash
PATIENT_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"patient.arjun@gmail.com","password":"AmrutamSecurePass123!"}' | jq -r .data.token)
echo "Patient Token: $PATIENT_TOKEN"
```

### 4. Fetch Doctor Availability Slots for Tomorrow
```bash
TOMORROW=$(date -d "+1 day" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d 2>/dev/null || echo "2026-10-27")
curl -s "http://localhost:3000/api/v1/doctors/33333333-3333-4333-8333-333333333331/slots?date=$TOMORROW" | jq .
```

### 5. Book an Appointment Slot with Idempotency Key
```bash
curl -s -X POST http://localhost:3000/api/v1/bookings \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-1001" \
  -d '{
    "slotId": "55555555-5555-4555-8555-555555555554",
    "chiefComplaint": "Chronic digestive indigestion and sleep disruption",
    "symptoms": ["Indigestion", "Insomnia"]
  }' | jq .
```

### 6. Doctor Login & Issue Digitally Signed Tamper-Proof Prescription
```bash
DOCTOR_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr.sharma@amrutam.co.in","password":"AmrutamSecurePass123!"}' | jq -r .data.token)

# Query consultation and issue prescription
# (Replace CONSULTATION_ID with the ID from previous booking step)
```

### 7. View Real-Time Prometheus Metrics
```bash
curl -s http://localhost:3000/metrics | grep -E "(http_requests_total|telemedicine_)"
```

### 8. View Admin Operational Analytics Dashboard
```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@amrutam.co.in","password":"AmrutamSecurePass123!"}' | jq -r .data.token)

curl -s -X GET http://localhost:3000/api/v1/analytics/dashboard \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```
