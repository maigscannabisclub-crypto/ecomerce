# =============================================================================
# E-COMMERCE PLATFORM - GOOGLE CLOUD INFRASTRUCTURE
# Terraform Configuration
# =============================================================================

terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
  
  backend "gcs" {
    bucket = "ecommerce-terraform-state"
    prefix = "terraform/state"
  }
}

# =============================================================================
# LOCALS
# =============================================================================
locals {
  project_id = var.project_id
  region     = var.region
  zone       = var.zone
  
  common_labels = {
    environment = var.environment
    project     = "ecommerce"
    managed_by  = "terraform"
  }
  
  services = ["api-gateway", "auth-service", "product-service", "cart-service", "order-service", "inventory-service", "reporting-service"]
}

# =============================================================================
# PROVIDER CONFIGURATION
# =============================================================================
provider "google" {
  project = local.project_id
  region  = local.region
  zone    = local.zone
}

provider "google-beta" {
  project = local.project_id
  region  = local.region
  zone    = local.zone
}

# =============================================================================
# ENABLE APIs
# =============================================================================
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "cloudprofiler.googleapis.com",
    "networkmanagement.googleapis.com",
    "servicenetworking.googleapis.com",
  ])
  
  service            = each.value
  disable_on_destroy = false
}

# =============================================================================
# VPC NETWORK
# =============================================================================
resource "google_compute_network" "vpc" {
  name                    = "ecommerce-vpc"
  auto_create_subnetworks = false
  routing_mode            = "GLOBAL"
  
  depends_on = [google_project_service.apis]
}

# Subnet for GKE
resource "google_compute_subnetwork" "gke_subnet" {
  name          = "ecommerce-gke-subnet"
  ip_cidr_range = "10.0.0.0/16"
  region        = local.region
  network       = google_compute_network.vpc.id
  
  private_ip_google_access = true
  
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }
  
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"
  }
}

# Subnet for Cloud SQL and Redis
resource "google_compute_subnetwork" "services_subnet" {
  name          = "ecommerce-services-subnet"
  ip_cidr_range = "10.3.0.0/24"
  region        = local.region
  network       = google_compute_network.vpc.id
  
  private_ip_google_access = true
}

# =============================================================================
# FIREWALL RULES
# =============================================================================
resource "google_compute_firewall" "allow_internal" {
  name    = "ecommerce-allow-internal"
  network = google_compute_network.vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  
  allow {
    protocol = "icmp"
  }
  
  source_ranges = ["10.0.0.0/8"]
}

resource "google_compute_firewall" "allow_health_checks" {
  name    = "ecommerce-allow-health-checks"
  network = google_compute_network.vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["3000-3006", "8080", "9090"]
  }
  
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
}
