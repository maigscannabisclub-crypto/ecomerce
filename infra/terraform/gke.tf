# =============================================================================
# GOOGLE KUBERNETES ENGINE (GKE)
# =============================================================================

resource "google_container_cluster" "primary" {
  name     = "ecommerce-cluster-${var.environment}"
  location = var.region
  
  # We can't create a cluster with no node pool defined, but we want to only use
  # separately managed node pools. So we create the smallest possible default
  # node pool and immediately delete it.
  remove_default_node_pool = true
  initial_node_count       = 1
  
  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.gke_subnet.name
  
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }
  
  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "0.0.0.0/0"
      display_name = "All"
    }
  }
  
  # Enable Workload Identity
  workload_identity_config {
    workload_pool = "${local.project_id}.svc.id.goog"
  }
  
  # Enable Network Policy
  network_policy {
    enabled = true
  }
  
  # Enable Vertical Pod Autoscaling
  vertical_pod_autoscaling {
    enabled = true
  }
  
  # Enable Managed Prometheus
  monitoring_config {
    enable_managed_prometheus = true
  }
  
  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }
  
  depends_on = [google_project_service.apis]
  
  labels = local.common_labels
}

# =============================================================================
# NODE POOL - GENERAL PURPOSE
# =============================================================================
resource "google_container_node_pool" "general" {
  name       = "general-pool"
  location   = var.region
  cluster    = google_container_cluster.primary.name
  node_count = var.gke_node_count
  
  node_config {
    machine_type = var.gke_machine_type
    
    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
    
    labels = {
      workload = "general"
    }
    
    tags = ["ecommerce", "gke-nodes"]
    
    metadata = {
      disable-legacy-endpoints = "true"
    }
  }
  
  management {
    auto_repair  = true
    auto_upgrade = true
  }
  
  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }
}

# =============================================================================
# NODE POOL - WORKLOADS (OPTIONAL - FOR PRODUCTION)
# =============================================================================
resource "google_container_node_pool" "workloads" {
  count = var.environment == "prod" ? 1 : 0
  
  name     = "workloads-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name
  
  autoscaling {
    min_node_count = 2
    max_node_count = 10
  }
  
  node_config {
    machine_type = "e2-standard-2"
    
    service_account = google_service_account.gke_nodes.email
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
    
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
    
    labels = {
      workload = "microservices"
    }
    
    taint {
      key    = "dedicated"
      value  = "microservices"
      effect = "NO_SCHEDULE"
    }
    
    tags = ["ecommerce", "workloads"]
  }
  
  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# =============================================================================
# SERVICE ACCOUNT FOR GKE NODES
# =============================================================================
resource "google_service_account" "gke_nodes" {
  account_id   = "gke-nodes-${var.environment}"
  display_name = "GKE Nodes Service Account"
  description  = "Service account for GKE node pools"
}

resource "google_project_iam_member" "gke_node_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/autoscaling.metricsWriter",
  ])
  
  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}
