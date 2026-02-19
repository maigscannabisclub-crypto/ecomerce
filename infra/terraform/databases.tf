# =============================================================================
# CLOUD SQL - POSTGRESQL
# =============================================================================

# Private IP range for Cloud SQL
resource "google_compute_global_address" "private_ip_range" {
  name          = "ecommerce-private-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# Cloud SQL PostgreSQL Instance
resource "google_sql_database_instance" "main" {
  name             = "ecommerce-postgres-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.region
  
  depends_on = [google_service_networking_connection.private_vpc_connection]
  
  settings {
    tier = var.db_tier
    
    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.vpc.id
      
      authorized_networks {
        name  = "gke-cluster"
        value = "10.0.0.0/16"
      }
    }
    
    backup_configuration {
      enabled    = true
      start_time = "03:00"
      
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }
    
    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }
    
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }
    
    database_flags {
      name  = "max_connections"
      value = "500"
    }
  }
  
  deletion_protection = var.environment == "prod" ? true : false
}

# Create databases for each service
resource "google_sql_database" "databases" {
  for_each = toset(["auth", "product", "cart", "order", "inventory", "reporting"])
  
  name     = "${each.value}_db"
  instance = google_sql_database_instance.main.name
}

# Cloud SQL User
resource "google_sql_user" "app_user" {
  name     = "ecommerce_app"
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# =============================================================================
# MEMORYSTORE - REDIS
# =============================================================================
resource "google_redis_instance" "cache" {
  name               = "ecommerce-redis-${var.environment}"
  tier               = var.redis_tier
  memory_size_gb     = 2
  region             = var.region
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  redis_version      = "REDIS_7_0"
  display_name       = "E-Commerce Redis Cache"
  
  depends_on = [google_service_networking_connection.private_vpc_connection]
  
  labels = local.common_labels
}
