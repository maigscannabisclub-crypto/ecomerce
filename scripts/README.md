# E-Commerce Platform - Scripts de Automatización

Este directorio contiene todos los scripts de utilidad y automatización para la plataforma e-commerce.

## 📋 Scripts Disponibles

### 🚀 Scripts Principales

| Script | Descripción | Uso |
|--------|-------------|-----|
| `setup.sh` | Inicialización completa de la plataforma | `./setup.sh` |
| `start.sh` | Iniciar la plataforma (dev/prod) | `./start.sh [-m development\|production]` |
| `stop.sh` | Detener la plataforma | `./stop.sh [-v]` |
| `logs.sh` | Ver logs de servicios | `./logs.sh [servicio]` |

### 🧪 Testing y Calidad

| Script | Descripción | Uso |
|--------|-------------|-----|
| `test.sh` | Ejecutar tests (unit/integration/e2e) | `./test.sh [-t unit\|integration\|e2e]` |
| `health-check.sh` | Verificar estado de la plataforma | `./health-check.sh [-v]` |

### 🗄️ Base de Datos

| Script | Descripción | Uso |
|--------|-------------|-----|
| `migrate.sh` | Gestión de migraciones | `./migrate.sh [up\|down\|status\|create]` |
| `seed.sh` | Cargar datos de prueba | `./seed.sh [users\|products\|orders\|all]` |

### ☸️ Kubernetes

| Script | Descripción | Uso |
|--------|-------------|-----|
| `deploy-k8s.sh` | Desplegar en Kubernetes | `./deploy-k8s.sh deploy [-e production]` |

### 🧹 Mantenimiento

| Script | Descripción | Uso |
|--------|-------------|-----|
| `cleanup.sh` | Limpieza de recursos | `./cleanup.sh [-a]` |

## 📖 Uso Detallado

### setup.sh - Inicialización

```bash
# Configuración inicial completa
./setup.sh

# Realiza:
# - Verificación de dependencias (Docker, docker-compose, kubectl)
# - Creación de redes Docker
# - Creación de volúmenes
# - Generación de archivo .env
# - Generación de certificados SSL
# - Inicialización de bases de datos
```

### start.sh - Iniciar Plataforma

```bash
# Modo desarrollo (con hot reload)
./start.sh
./start.sh -m development

# Modo producción
./start.sh -m production

# Reconstruir imágenes
./start.sh -b

# Iniciar servicios específicos
./start.sh api-gateway web
```

### stop.sh - Detener Plataforma

```bash
# Detener servicios
./stop.sh

# Detener y eliminar volúmenes
./stop.sh -v

# Forzar sin confirmación
./stop.sh -f
```

### logs.sh - Ver Logs

```bash
# Logs de todos los servicios
./logs.sh

# Logs de un servicio específico
./logs.sh api-gateway

# Seguir logs en tiempo real
./logs.sh -f

# Últimas N líneas
./logs.sh -n 50

# Filtrar por patrón
./logs.sh --filter ERROR

# Exportar logs
./logs.sh --export logs.txt
```

### test.sh - Ejecutar Tests

```bash
# Todos los tests
./test.sh

# Tests unitarios
./test.sh -t unit

# Tests de integración
./test.sh -t integration

# Tests e2e
./test.sh -t e2e

# Tests de un servicio
./test.sh -t unit -s api-gateway

# Con cobertura
./test.sh --verbose
```

### migrate.sh - Migraciones

```bash
# Ver estado
./migrate.sh status

# Ejecutar migraciones
./migrate.sh up

# Revertir última migración
./migrate.sh down

# Crear nueva migración
./migrate.sh create add_users_table

# Revertir todas
./migrate.sh reset
```

### seed.sh - Datos de Prueba

```bash
# Cargar todos los datos
./seed.sh

# Solo usuarios
./seed.sh users

# Solo productos
./seed.sh products

# Limpiar y cargar
./seed.sh -c

# Cantidad específica
./seed.sh products -n 100
```

### health-check.sh - Verificar Estado

```bash
# Health check básico
./health-check.sh

# Con información detallada
./health-check.sh -v

# Salida JSON
./health-check.sh -j

# Monitoreo continuo
./health-check.sh -w -i 10

# Guardar reporte
./health-check.sh -o report.json
```

### deploy-k8s.sh - Kubernetes

```bash
# Desplegar en desarrollo
./deploy-k8s.sh deploy

# Desplegar en producción
./deploy-k8s.sh deploy -e production

# Usar Helm
./deploy-k8s.sh deploy --helm

# Ver estado
./deploy-k8s.sh status

# Ver logs
./deploy-k8s.sh logs

# Escalar servicio
./deploy-k8s.sh scale web --replicas 5

# Rollback
./deploy-k8s.sh rollback

# Eliminar despliegue
./deploy-k8s.sh destroy
```

### cleanup.sh - Limpieza

```bash
# Eliminar contenedores
./cleanup.sh

# Eliminar contenedores y volúmenes
./cleanup.sh -v

# Limpieza completa
./cleanup.sh -a

# Forzar sin confirmación
./cleanup.sh -a -f

# Simular (dry-run)
./cleanup.sh -a --dry-run
```

## 🔧 Makefile

El Makefile proporciona comandos abreviados para operaciones comunes:

```bash
# Configuración
make setup              # Configuración inicial
make generate-env       # Generar .env

# Inicio/Detención
make start              # Iniciar en desarrollo
make start-prod         # Iniciar en producción
make stop               # Detener
make restart            # Reiniciar

# Logs
make logs               # Ver logs
make logs-follow        # Logs en tiempo real
make logs-api           # Logs del API

# Testing
make test               # Todos los tests
make test-unit          # Tests unitarios
make test-integration   # Tests de integración
make test-e2e           # Tests e2e

# Base de datos
make migrate            # Ejecutar migraciones
make migrate-status     # Estado de migraciones
make seed               # Cargar datos

# Health
make health             # Health check
make health-verbose     # Health check detallado

# Kubernetes
make k8s-deploy         # Desplegar en K8s
make k8s-status         # Estado de K8s
make k8s-logs           # Logs de K8s

# Limpieza
make clean              # Limpiar contenedores
make clean-all          # Limpieza completa
make prune              # Prune de Docker

# Utilidades
make shell-api          # Shell en API Gateway
make shell-db           # Shell en PostgreSQL
make backup             # Backup de BD
make stats              # Estadísticas
make urls               # URLs de acceso
```

## 📝 Archivos JavaScript

### .env.generator.js

Generador de variables de entorno con valores seguros aleatorios:

```bash
# Generar .env para development
node .env.generator.js

# Generar para producción
node .env.generator.js -e production

# Forzar sobrescritura
node .env.generator.js -f

# Generar .env.example
node .env.generator.js --example
```

### docker-health-check.js

Script de verificación de salud para contenedores Docker:

```bash
# Check HTTP
node docker-health-check.js --type http -p 3000

# Check TCP
node docker-health-check.js --type tcp -p 5432

# Check con comando
node docker-health-check.js --type command --command "pg_isready"

# Verbose
node docker-health-check.js -v
```

## 🔐 Variables de Entorno Generadas

El script `setup.sh` y `.env.generator.js` generan automáticamente:

- `POSTGRES_PASSWORD` - Contraseña segura para PostgreSQL
- `MONGODB_PASSWORD` - Contraseña segura para MongoDB
- `REDIS_PASSWORD` - Contraseña segura para Redis
- `RABBITMQ_PASSWORD` - Contraseña segura para RabbitMQ
- `JWT_SECRET` - Secreto para tokens JWT
- `SESSION_SECRET` - Secreto para sesiones
- `API_KEY` - Clave de API

## 📁 Estructura de Archivos

```
scripts/
├── setup.sh              # Inicialización
├── start.sh              # Iniciar plataforma
├── stop.sh               # Detener plataforma
├── test.sh               # Ejecutar tests
├── logs.sh               # Ver logs
├── migrate.sh            # Migraciones
├── seed.sh               # Datos de prueba
├── health-check.sh       # Verificar estado
├── deploy-k8s.sh         # Desplegar en K8s
├── cleanup.sh            # Limpieza
├── Makefile              # Comandos make
├── .env.generator.js     # Generador de .env
├── docker-health-check.js # Health check Docker
└── README.md             # Esta documentación
```

## 🎨 Códigos de Salida

| Código | Significado |
|--------|-------------|
| 0 | Éxito |
| 1 | Error general |
| 130 | Script interrumpido (Ctrl+C) |

## 📞 Soporte

Para más información, consulta la documentación principal del proyecto o contacta al equipo de DevOps.
