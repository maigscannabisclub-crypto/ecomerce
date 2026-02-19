# =============================================================================
# ARTIFACT REGISTRY
# =============================================================================
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "ecommerce-repo"
  description   = "Docker repository for E-Commerce microservices"
  format        = "DOCKER"
  
  labels = local.common_labels
  
  depends_on = [google_project_service.apis]
}

# =============================================================================
# SECRET MANAGER
# =============================================================================
resource "google_secret_manager_secret" "db_password" {
  secret_id = "ecommerce-db-password"
  
  labels = local.common_labels
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "ecommerce-jwt-secret"
  
  labels = local.common_labels
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "rabbitmq_password" {
  secret_id = "ecommerce-rabbitmq-password"
  
  labels = local.common_labels
  
  replication {
    auto {}
  }
}

# =============================================================================
# SERVICE ACCOUNT FOR MICROSERVICES
# =============================================================================
resource "google_service_account" "microservices" {
  account_id   = "ecommerce-microservices"
  display_name = "E-Commerce Microservices"
  description  = "Service account for E-Commerce microservices"
}

# IAM binding for microservices to access secrets
resource "google_secret_manager_secret_iam_member" "microservices_secret_access" {
  for_each = toset([
    google_secret_manager_secret.db_password.secret_id,
    google_secret_manager_secret.jwt_secret.secret_id,
    google_secret_manager_secret.rabbitmq_password.secret_id,
  ])
  
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.microservices.email}"
}

# IAM binding for microservices to access Cloud SQL
resource "google_project_iam_member" "microservices_cloudsql" {
  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.microservices.email}"
}

# Workload Identity binding
resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.microservices.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${local.project_id}.svc.id.goog[default/ecommerce-microservices]"
}
