# E-Commerce Platform Makefile
# Provides convenient commands for development and deployment

.PHONY: help setup-env up down restart logs build test clean health-check

# Default service for targeted commands
SERVICE ?= api-gateway

# Colors for output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

##@ General

help: ## Display this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Environment Setup

setup-env: ## Create .env files from .env.example for all services
	@echo "$(BLUE)Setting up environment files...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		if [ ! -f services/$$service/.env ]; then \
			cp services/$$service/.env.example services/$$service/.env; \
			echo "$(GREEN)Created: services/$$service/.env$(NC)"; \
		else \
			echo "$(YELLOW)Already exists: services/$$service/.env$(NC)"; \
		fi \
	done
	@echo "$(GREEN)✅ Environment setup complete!$(NC)"

install-deps: ## Install dependencies for all services
	@echo "$(BLUE)Installing dependencies for all services...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Installing: $$service$(NC)"; \
		cd services/$$service && npm install && cd ../..; \
	done
	@echo "$(GREEN)✅ Dependencies installed!$(NC)"

##@ Docker Operations

up: ## Start all services with docker-compose
	@echo "$(BLUE)Starting all services...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✅ Services started!$(NC)"
	@echo "$(YELLOW)API Gateway: http://localhost:3000$(NC)"
	@echo "$(YELLOW)RabbitMQ Management: http://localhost:15672$(NC)"

up-build: ## Build and start all services
	@echo "$(BLUE)Building and starting all services...$(NC)"
	docker-compose up -d --build
	@echo "$(GREEN)✅ Services built and started!$(NC)"

down: ## Stop all services
	@echo "$(BLUE)Stopping all services...$(NC)"
	docker-compose down
	@echo "$(GREEN)✅ Services stopped!$(NC)"

down-volumes: ## Stop all services and remove volumes
	@echo "$(RED)Stopping all services and removing volumes...$(NC)"
	docker-compose down -v
	@echo "$(GREEN)✅ Services and volumes removed!$(NC)"

restart: ## Restart a specific service (use SERVICE=<name>)
	@echo "$(BLUE)Restarting $(SERVICE)...$(NC)"
	docker-compose restart $(SERVICE)
	@echo "$(GREEN)✅ $(SERVICE) restarted!$(NC)"

restart-all: ## Restart all services
	@echo "$(BLUE)Restarting all services...$(NC)"
	docker-compose restart
	@echo "$(GREEN)✅ All services restarted!$(NC)"

logs: ## View logs for all services
	docker-compose logs -f

logs-service: ## View logs for a specific service (use SERVICE=<name>)
	docker-compose logs -f $(SERVICE)

ps: ## List running containers
	docker-compose ps

##@ Build

build: ## Build all services
	@echo "$(BLUE)Building all services...$(NC)"
	docker-compose build
	@echo "$(GREEN)✅ Build complete!$(NC)"

build-service: ## Build a specific service (use SERVICE=<name>)
	@echo "$(BLUE)Building $(SERVICE)...$(NC)"
	docker-compose build $(SERVICE)
	@echo "$(GREEN)✅ $(SERVICE) built!$(NC)"

##@ Testing

test: ## Run tests for all services
	@echo "$(BLUE)Running tests for all services...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Testing: $$service$(NC)"; \
		cd services/$$service && npm test && cd ../..; \
	done
	@echo "$(GREEN)✅ All tests completed!$(NC)"

test-service: ## Run tests for a specific service (use SERVICE=<name>)
	@echo "$(BLUE)Running tests for $(SERVICE)...$(NC)"
	cd services/$(SERVICE) && npm test

test-unit: ## Run unit tests for all services
	@echo "$(BLUE)Running unit tests...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Unit tests: $$service$(NC)"; \
		cd services/$$service && npm run test:unit && cd ../..; \
	done

test-integration: ## Run integration tests for all services
	@echo "$(BLUE)Running integration tests...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Integration tests: $$service$(NC)"; \
		cd services/$$service && npm run test:integration && cd ../..; \
	done

test-coverage: ## Run tests with coverage for all services
	@echo "$(BLUE)Running tests with coverage...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Coverage: $$service$(NC)"; \
		cd services/$$service && npm run test:coverage && cd ../..; \
	done

##@ Code Quality

lint: ## Run linter for all services
	@echo "$(BLUE)Running linter...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Linting: $$service$(NC)"; \
		cd services/$$service && npm run lint && cd ../..; \
	done
	@echo "$(GREEN)✅ Linting complete!$(NC)"

lint-fix: ## Fix linting issues for all services
	@echo "$(BLUE)Fixing linting issues...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Fixing: $$service$(NC)"; \
		cd services/$$service && npm run lint:fix && cd ../..; \
	done
	@echo "$(GREEN)✅ Linting issues fixed!$(NC)"

typecheck: ## Run TypeScript type checking for all services
	@echo "$(BLUE)Running type checking...$(NC)"
	@for service in api-gateway auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Type check: $$service$(NC)"; \
		cd services/$$service && npm run typecheck && cd ../..; \
	done
	@echo "$(GREEN)✅ Type checking complete!$(NC)"

##@ Health & Monitoring

health-check: ## Check health of all services
	@echo "$(BLUE)Checking service health...$(NC)"
	@curl -s http://localhost:3000/health && echo " - API Gateway" || echo "$(RED)✗ API Gateway$(NC)"
	@curl -s http://localhost:3001/health && echo " - Auth Service" || echo "$(RED)✗ Auth Service$(NC)"
	@curl -s http://localhost:3002/health && echo " - Product Service" || echo "$(RED)✗ Product Service$(NC)"
	@curl -s http://localhost:3003/health && echo " - Cart Service" || echo "$(RED)✗ Cart Service$(NC)"
	@curl -s http://localhost:3004/health && echo " - Order Service" || echo "$(RED)✗ Order Service$(NC)"
	@curl -s http://localhost:3005/health && echo " - Inventory Service" || echo "$(RED)✗ Inventory Service$(NC)"
	@curl -s http://localhost:3006/health && echo " - Reporting Service" || echo "$(RED)✗ Reporting Service$(NC)"

##@ Database

db-migrate: ## Run database migrations for all services
	@echo "$(BLUE)Running database migrations...$(NC)"
	@for service in auth-service product-service cart-service order-service inventory-service reporting-service; do \
		echo "$(BLUE)Migrating: $$service$(NC)"; \
		cd services/$$service && npm run migrate && cd ../..; \
	done
	@echo "$(GREEN)✅ Migrations complete!$(NC)"

db-seed: ## Seed databases with initial data
	@echo "$(BLUE)Seeding databases...$(NC)"
	@for service in auth-service product-service; do \
		echo "$(BLUE)Seeding: $$service$(NC)"; \
		cd services/$$service && npm run seed && cd ../..; \
	done
	@echo "$(GREEN)✅ Seeding complete!$(NC)"

##@ Cleanup

clean: ## Remove all containers, networks, and volumes
	@echo "$(RED)Cleaning up all resources...$(NC)"
	docker-compose down -v --remove-orphans
	docker system prune -f
	@echo "$(GREEN)✅ Cleanup complete!$(NC)"

clean-images: ## Remove all built images
	@echo "$(RED)Removing all images...$(NC)"
	docker-compose down --rmi all
	@echo "$(GREEN)✅ Images removed!$(NC)"

##@ Development

dev-service: ## Run a specific service in development mode (use SERVICE=<name>)
	@echo "$(BLUE)Starting $(SERVICE) in development mode...$(NC)"
	cd services/$(SERVICE) && npm run dev

##@ Utility

shell-service: ## Open a shell in a running service container (use SERVICE=<name>)
	docker-compose exec $(SERVICE) sh

redis-cli: ## Open Redis CLI
	docker-compose exec redis redis-cli

rabbitmq-admin: ## Open RabbitMQ management UI info
	@echo "$(GREEN)RabbitMQ Management UI: http://localhost:15672$(NC)"
	@echo "$(YELLOW)Username: guest$(NC)"
	@echo "$(YELLOW)Password: guest$(NC)"
