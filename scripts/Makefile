# =============================================================================
# E-Commerce Platform - Makefile
# =============================================================================
# Comandos comunes para la gestión de la plataforma e-commerce
# =============================================================================

# Variables
PROJECT_NAME := ecommerce-platform
SCRIPTS_DIR := ./scripts
COMPOSE_FILE := docker-compose.yml

# Colores
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

# =============================================================================
# Ayuda
# =============================================================================

.PHONY: help
help: ## Muestra esta ayuda
	@echo "$(BLUE)E-Commerce Platform - Comandos disponibles:$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# =============================================================================
# Configuración e Inicialización
# =============================================================================

.PHONY: setup
setup: ## Configuración inicial de la plataforma
	@echo "$(BLUE)🔧 Configurando E-Commerce Platform...$(NC)"
	@$(SCRIPTS_DIR)/setup.sh

.PHONY: env
copy-env: ## Copia el archivo .env.example a .env
	@if [ ! -f .env ]; then \
		echo "$(BLUE)Creando archivo .env...$(NC)"; \
		cp .env.example .env 2>/dev/null || $(SCRIPTS_DIR)/setup.sh; \
	else \
		echo "$(YELLOW)El archivo .env ya existe$(NC)"; \
	fi

.PHONY: generate-env
generate-env: ## Genera variables de entorno usando Node.js
	@echo "$(BLUE)📝 Generando variables de entorno...$(NC)"
	@node $(SCRIPTS_DIR)/.env.generator.js

# =============================================================================
# Inicio y Detención
# =============================================================================

.PHONY: start
start: ## Inicia la plataforma en modo desarrollo
	@echo "$(GREEN)🚀 Iniciando plataforma en modo desarrollo...$(NC)"
	@$(SCRIPTS_DIR)/start.sh -m development

.PHONY: start-prod
start-prod: ## Inicia la plataforma en modo producción
	@echo "$(GREEN)🚀 Iniciando plataforma en modo producción...$(NC)"
	@$(SCRIPTS_DIR)/start.sh -m production

.PHONY: stop
stop: ## Detiene la plataforma
	@echo "$(YELLOW)🛑 Deteniendo plataforma...$(NC)"
	@$(SCRIPTS_DIR)/stop.sh

.PHONY: restart
restart: stop start ## Reinicia la plataforma

.PHONY: restart-prod
restart-prod: stop start-prod ## Reinicia la plataforma en modo producción

.PHONY: rebuild
rebuild: ## Reconstruye e inicia la plataforma
	@echo "$(BLUE)🔨 Reconstruyendo plataforma...$(NC)"
	@$(SCRIPTS_DIR)/start.sh -m development -b

# =============================================================================
# Logs
# =============================================================================

.PHONY: logs
logs: ## Muestra logs de todos los servicios
	@$(SCRIPTS_DIR)/logs.sh

.PHONY: logs-follow
logs-follow: ## Muestra logs en tiempo real
	@$(SCRIPTS_DIR)/logs.sh -f

.PHONY: logs-api
logs-api: ## Muestra logs del API Gateway
	@$(SCRIPTS_DIR)/logs.sh api-gateway

.PHONY: logs-web
logs-web: ## Muestra logs del frontend web
	@$(SCRIPTS_DIR)/logs.sh web

.PHONY: logs-db
logs-db: ## Muestra logs de las bases de datos
	@$(SCRIPTS_DIR)/logs.sh postgres mongodb redis

# =============================================================================
# Testing
# =============================================================================

.PHONY: test
test: ## Ejecuta todos los tests
	@echo "$(BLUE)🧪 Ejecutando tests...$(NC)"
	@$(SCRIPTS_DIR)/test.sh

.PHONY: test-unit
test-unit: ## Ejecuta tests unitarios
	@echo "$(BLUE)🧪 Ejecutando tests unitarios...$(NC)"
	@$(SCRIPTS_DIR)/test.sh -t unit

.PHONY: test-integration
test-integration: ## Ejecuta tests de integración
	@echo "$(BLUE)🧪 Ejecutando tests de integración...$(NC)"
	@$(SCRIPTS_DIR)/test.sh -t integration

.PHONY: test-e2e
test-e2e: ## Ejecuta tests end-to-end
	@echo "$(BLUE)🧪 Ejecutando tests e2e...$(NC)"
	@$(SCRIPTS_DIR)/test.sh -t e2e

.PHONY: test-coverage
test-coverage: ## Ejecuta tests con cobertura
	@echo "$(BLUE)📊 Ejecutando tests con cobertura...$(NC)"
	@$(SCRIPTS_DIR)/test.sh --verbose

# =============================================================================
# Base de Datos
# =============================================================================

.PHONY: migrate
migrate: ## Ejecuta migraciones pendientes
	@echo "$(BLUE)🗄️  Ejecutando migraciones...$(NC)"
	@$(SCRIPTS_DIR)/migrate.sh up

.PHONY: migrate-status
migrate-status: ## Muestra estado de migraciones
	@$(SCRIPTS_DIR)/migrate.sh status

.PHONY: migrate-down
migrate-down: ## Revierte la última migración
	@echo "$(YELLOW)⚠️  Revirtiendo última migración...$(NC)"
	@$(SCRIPTS_DIR)/migrate.sh down

.PHONY: migrate-create
migrate-create: ## Crea una nueva migración (uso: make migrate-create NAME=nombre)
	@if [ -z "$(NAME)" ]; then \
		echo "$(RED)Error: Debes especificar NAME=nombre_de_migracion$(NC)"; \
		exit 1; \
	fi
	@$(SCRIPTS_DIR)/migrate.sh create $(NAME)

.PHONY: seed
seed: ## Carga datos de prueba
	@echo "$(BLUE)🌱 Cargando datos de prueba...$(NC)"
	@$(SCRIPTS_DIR)/seed.sh

.PHONY: seed-clean
seed-clean: ## Limpia y carga datos de prueba
	@echo "$(YELLOW)🌱 Limpiando y cargando datos de prueba...$(NC)"
	@$(SCRIPTS_DIR)/seed.sh -c

.PHONY: db-reset
db-reset: ## Reset completo de base de datos
	@echo "$(RED)⚠️  Reset completo de base de datos...$(NC)"
	@$(SCRIPTS_DIR)/migrate.sh reset

# =============================================================================
# Health Check
# =============================================================================

.PHONY: health
health: ## Verifica el estado de salud de la plataforma
	@$(SCRIPTS_DIR)/health-check.sh

.PHONY: health-verbose
health-verbose: ## Health check con información detallada
	@$(SCRIPTS_DIR)/health-check.sh -v

.PHONY: health-watch
health-watch: ## Monitoreo continuo de salud
	@$(SCRIPTS_DIR)/health-check.sh -w

.PHONY: health-json
health-json: ## Health check con salida JSON
	@$(SCRIPTS_DIR)/health-check.sh -j

# =============================================================================
# Kubernetes
# =============================================================================

.PHONY: k8s-deploy
k8s-deploy: ## Despliega en Kubernetes
	@echo "$(BLUE)☸️  Desplegando en Kubernetes...$(NC)"
	@$(SCRIPTS_DIR)/deploy-k8s.sh deploy

.PHONY: k8s-deploy-prod
k8s-deploy-prod: ## Despliega en Kubernetes (producción)
	@echo "$(BLUE)☸️  Desplegando en Kubernetes (producción)...$(NC)"
	@$(SCRIPTS_DIR)/deploy-k8s.sh deploy -e production

.PHONY: k8s-destroy
k8s-destroy: ## Elimina despliegue de Kubernetes
	@echo "$(RED)⚠️  Eliminando despliegue de Kubernetes...$(NC)"
	@$(SCRIPTS_DIR)/deploy-k8s.sh destroy

.PHONY: k8s-status
k8s-status: ## Muestra estado del despliegue en Kubernetes
	@$(SCRIPTS_DIR)/deploy-k8s.sh status

.PHONY: k8s-logs
k8s-logs: ## Muestra logs de Kubernetes
	@$(SCRIPTS_DIR)/deploy-k8s.sh logs

.PHONY: k8s-scale
k8s-scale: ## Escala un servicio (uso: make k8s-scale SERVICE=api-gateway REPLICAS=3)
	@if [ -z "$(SERVICE)" ] || [ -z "$(REPLICAS)" ]; then \
		echo "$(RED)Error: Debes especificar SERVICE=nombre REPLICAS=numero$(NC)"; \
		exit 1; \
	fi
	@$(SCRIPTS_DIR)/deploy-k8s.sh scale $(SERVICE) --replicas $(REPLICAS)

# =============================================================================
# Limpieza
# =============================================================================

.PHONY: clean
clean: ## Limpia contenedores detenidos
	@echo "$(YELLOW)🧹 Limpiando contenedores...$(NC)"
	@$(SCRIPTS_DIR)/cleanup.sh

.PHONY: clean-all
clean-all: ## Limpieza completa (contenedores, volúmenes, imágenes)
	@echo "$(RED)🧹 Limpieza completa...$(NC)"
	@$(SCRIPTS_DIR)/cleanup.sh -a

.PHONY: clean-volumes
clean-volumes: ## Elimina volúmenes (⚠️ pierdes datos)
	@echo "$(RED)⚠️  Eliminando volúmenes...$(NC)"
	@$(SCRIPTS_DIR)/cleanup.sh -v -f

.PHONY: prune
prune: ## Limpieza de sistema Docker
	@echo "$(YELLOW)🧹 Limpiando sistema Docker...$(NC)"
	docker system prune -f
	docker volume prune -f

# =============================================================================
# Desarrollo
# =============================================================================

.PHONY: dev
dev: ## Inicia entorno de desarrollo con hot reload
	@echo "$(GREEN)🔥 Iniciando modo desarrollo...$(NC)"
	@$(SCRIPTS_DIR)/start.sh -m development

.PHONY: dev-build
dev-build: ## Reconstruye y inicia en modo desarrollo
	@echo "$(GREEN)🔨 Reconstruyendo y iniciando...$(NC)"
	@$(SCRIPTS_DIR)/start.sh -m development -b

.PHONY: dev-logs
dev-logs: ## Muestra logs en desarrollo
	@docker-compose logs -f

.PHONY: shell-api
shell-api: ## Abre shell en el contenedor del API Gateway
	@docker exec -it api-gateway /bin/sh

.PHONY: shell-db
shell-db: ## Abre shell en PostgreSQL
	@docker exec -it postgres psql -U ecommerce_user -d ecommerce

.PHONY: shell-redis
shell-redis: ## Abre shell en Redis
	@docker exec -it redis redis-cli

# =============================================================================
# Utilidades
# =============================================================================

.PHONY: ssl
ssl: ## Genera certificados SSL para desarrollo
	@echo "$(BLUE)🔐 Generando certificados SSL...$(NC)"
	@mkdir -p ssl
	@openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
		-keyout ssl/localhost.key -out ssl/localhost.crt \
		-subj "/C=US/ST=State/L=City/O=E-Commerce/CN=localhost" \
		-addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1" 2>/dev/null || \
		$(SCRIPTS_DIR)/setup.sh

.PHONY: backup
backup: ## Crea backup de bases de datos
	@echo "$(BLUE)💾 Creando backup...$(NC)"
	@mkdir -p backups
	@docker exec postgres pg_dump -U ecommerce_user ecommerce > backups/postgres_$(shell date +%Y%m%d_%H%M%S).sql
	@docker exec mongodb mongodump --out /data/backups/mongodb_$(shell date +%Y%m%d_%H%M%S)
	@echo "$(GREEN)✅ Backup completado$(NC)"

.PHONY: update
update: ## Actualiza imágenes Docker
	@echo "$(BLUE)🔄 Actualizando imágenes...$(NC)"
	docker-compose pull
	docker-compose build --no-cache

.PHONY: stats
stats: ## Muestra estadísticas de recursos
	@echo "$(BLUE)📊 Estadísticas de recursos:$(NC)"
	@docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# =============================================================================
# CI/CD
# =============================================================================

.PHONY: ci-build
ci-build: ## Build para CI/CD
	@echo "$(BLUE)🔨 Building para CI/CD...$(NC)"
	docker-compose -f docker-compose.yml build

.PHONY: ci-test
ci-test: ## Tests para CI/CD
	@echo "$(BLUE)🧪 Ejecutando tests para CI/CD...$(NC)"
	@$(SCRIPTS_DIR)/test.sh --no-coverage

.PHONY: ci-push
ci-push: ## Push de imágenes para CI/CD
	@echo "$(BLUE)📤 Pushing imágenes...$(NC)"
	docker-compose push

# =============================================================================
# Información
# =============================================================================

.PHONY: status
status: ## Muestra estado de los servicios
	@echo "$(BLUE)📋 Estado de los servicios:$(NC)"
	@docker-compose ps

.PHONY: version
version: ## Muestra versiones de herramientas
	@echo "$(BLUE)📦 Versiones:$(NC)"
	@echo "Docker: $$(docker --version)"
	@echo "Docker Compose: $$(docker-compose --version || docker compose version)"
	@echo "Kubectl: $$(kubectl version --client --short 2>/dev/null || echo 'No instalado')"
	@echo "Helm: $$(helm version --short 2>/dev/null || echo 'No instalado')"

.PHONY: urls
urls: ## Muestra URLs de acceso
	@echo "$(GREEN)🌐 URLs de acceso:$(NC)"
	@echo "Web App:        http://localhost:8080"
	@echo "API Gateway:    http://localhost:3000"
	@echo "API Docs:       http://localhost:3000/api/docs"
	@echo "RabbitMQ Mgmt:  http://localhost:15672"
	@echo "Grafana:        http://localhost:3001"
	@echo "Prometheus:     http://localhost:9090"

# =============================================================================
# Default
# =============================================================================

.DEFAULT_GOAL := help
