output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "aurora_postgres_cluster_endpoint" {
  description = "Writer endpoint for Aurora PostgreSQL cluster"
  value       = aws_rds_cluster.aurora_postgres.endpoint
}

output "aurora_postgres_reader_endpoint" {
  description = "Read-only load-balanced endpoint for fast search and slot lookups"
  value       = aws_rds_cluster.aurora_postgres.reader_endpoint
}

output "redis_primary_endpoint" {
  description = "Primary endpoint for Redis replication group"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "kms_phi_key_arn" {
  description = "ARN of the KMS Key used for clinical data encryption"
  value       = aws_kms_key.phi_encryption_key.arn
}

output "eks_cluster_name" {
  description = "EKS Cluster Name"
  value       = aws_eks_cluster.eks.name
}
