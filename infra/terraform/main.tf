terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "AmrutamTelemedicine"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Compliance  = "DISHA-HIPAA"
    }
  }
}

# 1. High-Availability VPC across 3 Availability Zones
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "amrutam-${var.environment}-vpc"
  }
}

# 2. AWS KMS Key for Column-Level PHI & Health Data Encryption
resource "aws_kms_key" "phi_encryption_key" {
  description             = "KMS CMK for Amrutam PHI clinical notes and prescription encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "amrutam-phi-kms-key"
  }
}

resource "aws_kms_alias" "phi_key_alias" {
  name          = "alias/amrutam-phi-encryption"
  target_key_id = aws_kms_key.phi_encryption_key.key_id
}

# 3. Amazon Aurora PostgreSQL Cluster (Multi-AZ with Read Replicas)
resource "aws_rds_cluster" "aurora_postgres" {
  cluster_identifier      = "amrutam-${var.environment}-aurora-cluster"
  engine                  = "aurora-postgresql"
  engine_version          = "16.1"
  database_name           = "amrutam_telemedicine"
  master_username         = "amrutam_admin"
  master_password         = var.db_master_password
  backup_retention_period = 35
  preferred_backup_window = "02:00-03:00"
  storage_encrypted       = true
  kms_key_id              = aws_kms_key.phi_encryption_key.arn
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "amrutam-db-final-snapshot"

  serverlessv2_scaling_configuration {
    max_capacity = 64.0
    min_capacity = 2.0
  }
}

resource "aws_rds_cluster_instance" "aurora_instances" {
  count              = 3 # Multi-AZ Primary + 2 Read Replicas for p95 < 200ms reads
  identifier         = "amrutam-${var.environment}-db-node-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.aurora_postgres.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora_postgres.engine
  engine_version     = aws_rds_cluster.aurora_postgres.engine_version
}

# 4. Amazon ElastiCache Redis Cluster (Multi-AZ with Auto-Failover)
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "amrutam-${var.environment}-redis"
  description                   = "Distributed cache and Redlock store for Amrutam Telemedicine"
  node_type                     = "cache.r6g.large"
  num_cache_clusters            = 3
  port                          = 6379
  automatic_failover_enabled    = true
  multi_az_enabled              = true
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  kms_key_id                    = aws_kms_key.phi_encryption_key.arn
  parameter_group_name          = "default.redis7"
}

# 5. AWS EKS Cluster for Containerized Microservices
resource "aws_eks_cluster" "eks" {
  name     = "amrutam-${var.environment}-eks"
  role_arn = var.eks_cluster_role_arn
  version  = "1.29"

  vpc_config {
    endpoint_private_access = true
    endpoint_public_access  = true
    subnet_ids              = var.private_subnet_ids
  }

  encryption_config {
    provider {
      key_arn = aws_kms_key.phi_encryption_key.arn
    }
    resources = ["secrets"]
  }
}
