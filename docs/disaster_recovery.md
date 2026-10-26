# Disaster Recovery (DR) Strategy & Runbook

**Service:** Amrutam Telemedicine Platform  
**Target Availability:** 99.95% (~4.38 hours downtime/year maximum)  
**RPO (Recovery Point Objective):** < 15 minutes  
**RTO (Recovery Time Objective):** < 60 minutes  
**Primary Region:** AWS `ap-south-1` (Mumbai)  
**Secondary Region (DR):** AWS `ap-south-2` (Hyderabad)  

---

## 1. Resilience Architecture Overview

Amrutam implements a multi-tier disaster recovery architecture designed to withstand catastrophic cloud datacenter outages while preserving patient health record integrity and regulatory compliance under DISHA/HIPAA.

```
+-------------------------------------------------------------------------+
|                  Route53 DNS Active/Passive Failover                     |
|                                                                         |
|   Primary Region (ap-south-1)              Secondary DR Region (ap-south-2)
|   +--------------------------+             +--------------------------+
|   | EKS Cluster (Active)     |             | EKS Cluster (Standby)    |
|   | Aurora Postgres (Writer) |---Replication--> Aurora Replica (Cross-Reg)|
|   | ElastiCache Redis        |             | ElastiCache Redis        |
|   | S3 Backups & WAL Logs    |---Cross-Reg---> S3 Backup Mirror       |
|   +--------------------------+             +--------------------------+
+-------------------------------------------------------------------------+
```

---

## 2. Backup Strategy & Point-in-Time Recovery (PITR)

### Automated Continuous Backups:
1. **Aurora PostgreSQL Continuous WAL Streaming:**
   - Transaction Write-Ahead Logs (WAL) are streamed continuously to Amazon S3 every 5 minutes.
   - Provides 1-second granular Point-in-Time Recovery (PITR) for the last 35 days.
   - All backups encrypted with customer-managed AWS KMS keys.

2. **Snapshot Schedule:**
   - Daily automated cluster snapshot at 02:00 AM IST (low-traffic window).
   - Snapshots automatically copied to secondary region `ap-south-2` with cross-region KMS key re-encryption.
   - Monthly retention archives stored in AWS S3 Glacier Vault with Object Lock (WORM - Write Once, Read Many).

3. **Redis Cache Warm-Up:**
   - Redis RDB snapshots saved to S3 every 6 hours.
   - On cold start, critical master data (doctor metadata, specialization taxonomy) is pre-warmed from PostgreSQL into Redis before traffic is opened.

---

## 3. Disaster Classification & Response Tiers

| Incident Level | Scenario | Impact | Recovery Protocol |
|---|---|---|---|
| **Tier 1: Transient Service Outage** | Pod crash or Node failure in EKS | < 0.1% requests affected | Handled automatically by Kubernetes ReplicaSet and HPA self-healing (< 10 seconds). |
| **Tier 2: Single Availability Zone Failure** | Datacenter outage in `ap-south-1a` | Minimal latency spike | Multi-AZ Aurora auto-promotes standby instance in `ap-south-1b` (< 30 seconds). EKS shifts traffic to surviving AZs. |
| **Tier 3: Regional Catastrophe** | Total AWS Mumbai regional failure | API completely unreachable | Complete failover to DR Region `ap-south-2` using the step-by-step runbook below (RTO < 60 min, RPO < 15 min). |

---

## 4. Step-by-Step Regional Failover Runbook (Tier 3)

### Phase 1: Verification & Escalation (0 - 10 minutes)
1. Incident Commander confirms total regional unreachability via CloudWatch alarms, synthetic probes, and AWS Health Dashboard.
2. Declare disaster state in incident response bridge.

### Phase 2: Promote Database in DR Region (10 - 25 minutes)
```bash
# Promote Aurora cross-region replica in ap-south-2 to standalone primary writer
aws rds promote-read-replica \
  --db-instance-identifier amrutam-dr-replica-1 \
  --region ap-south-2

# Verify cluster writer status
aws rds describe-db-clusters \
  --db-cluster-identifier amrutam-dr-aurora-cluster \
  --region ap-south-2 \
  --query "DBClusters[0].Status"
```

### Phase 3: Scale Up DR Compute Infrastructure (25 - 40 minutes)
```bash
# Scale EKS deployment pods in DR region from standby (1 replica) to production (10+ replicas)
kubectl --context=dr-cluster scale deployment amrutam-telemedicine-api \
  --replicas=15 \
  --namespace=amrutam-prod

# Verify readiness probes passing
kubectl --context=dr-cluster get pods -n amrutam-prod
```

### Phase 4: Route53 Global DNS Switchover (40 - 50 minutes)
```bash
# Update Route53 failover record or promote health check failure
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch file://infra/dr/dns_failover_to_dr.json
```

### Phase 5: Verification & Business Confirmation (50 - 60 minutes)
1. Run automated smoke tests against `https://api.amrutam.co.in/health` and `/ready`.
2. Execute test slot booking and check audit logs.
3. Notify hospital partners and clinical operations that DR environment is active.
