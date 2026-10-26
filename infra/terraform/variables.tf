variable "aws_region" {
  description = "AWS region for data residency (DISHA/India data sovereignty requires ap-south-1)"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "db_master_password" {
  description = "Master password for Aurora PostgreSQL"
  type        = string
  sensitive   = true
}

variable "eks_cluster_role_arn" {
  description = "IAM role ARN for EKS cluster"
  type        = string
  default     = "arn:aws:iam::123456789012:role/AmrutamEKSClusterRole"
}

variable "private_subnet_ids" {
  description = "Private Subnet IDs for EKS and RDS"
  type        = list(string)
  default     = ["subnet-0123456789abcdef0", "subnet-0123456789abcdef1", "subnet-0123456789abcdef2"]
}
