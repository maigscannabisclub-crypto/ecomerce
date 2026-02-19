# Solución de Problemas

## Índice
1. [Problemas Comunes](#problemas-comunes)
2. [Errores de Instalación](#errores-de-instalación)
3. [Errores de Base de Datos](#errores-de-base-de-datos)
4. [Errores de Servicios](#errores-de-servicios)
5. [Problemas de Performance](#problemas-de-performance)
6. [Debugging](#debugging)
7. [Recursos de Ayuda](#recursos-de-ayuda)

---

## Problemas Comunes

### Quick Fixes

| Problema | Solución Rápida |
|----------|-----------------|
| `npm install` falla | `rm -rf node_modules && npm ci` |
| Puerto en uso | `lsof -ti:3000 \| xargs kill -9` |
| Docker no responde | `docker system prune -f` |
| Tests fallan | `npm run test:clear-cache` |
| TypeScript errors | `npx tsc --noEmit` |

---

## Errores de Instalación

### Error: `node-gyp` build failed

```bash
# macOS
xcode-select --install
brew install python

# Ubuntu/Debian
sudo apt-get install build-essential python3

# Reinstall dependencies
rm -rf node_modules
npm ci
```

### Error: `EACCES: permission denied`

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use npx
npx <command>
```

### Error: `Cannot find module '@ecommerce/shared'`

```bash
# Build shared packages first
npm run build --workspace=@ecommerce/shared

# Or build all packages
npm run build:packages
```

---

## Errores de Base de Datos

### Error: `Connection refused`

```bash
# Verificar PostgreSQL está corriendo
make infra-status

# O manualmente
docker ps | grep postgres

# Reiniciar servicios
make infra-restart

# Ver logs
docker logs ecommerce-postgres
```

### Error: `Migration failed`

```bash
# Resetear base de datos (development only!)
make db-reset

# O manualmente
cd apps/{service}
npx prisma migrate reset --force

# Para producción: crear migración de fix
npx prisma migrate dev --name fix_migration
```

### Error: `P1001: Can't reach database`

```bash
# Verificar variables de entorno
cat .env | grep DATABASE

# Probar conexión
psql $DATABASE_URL -c "SELECT 1"

# Verificar network de Docker
docker network ls
docker network inspect ecommerce-network
```

### Error: `Unique constraint failed`

```sql
-- Encontrar duplicados
SELECT email, COUNT(*) 
FROM users 
GROUP BY email 
HAVING COUNT(*) > 1;

-- Limpiar duplicados (development only!)
DELETE FROM users 
WHERE id NOT IN (
  SELECT MIN(id) 
  FROM users 
  GROUP BY email
);
```

---

## Errores de Servicios

### Service Won't Start

```bash
# Verificar logs
make logs SERVICE={service-name}

# Verificar puerto en uso
lsof -ti:3001

# Reiniciar servicio
make restart SERVICE={service-name}

# Verificar variables de entorno
node -e "console.log(require('./apps/{service}/.env'))"
```

### Error: `ECONNREFUSED` to other service

```bash
# Verificar servicio está corriendo
curl http://localhost:3001/health

# Verificar URLs en .env
cat .env | grep SERVICE_URL

# Verificar Docker network
docker network inspect ecommerce-network
```

### Error: `JWT verification failed`

```bash
# Verificar JWT_SECRET es igual en todos los servicios
grep JWT_SECRET .env apps/*/.env

# Generar nuevo token para testing
node -e "console.log(require('jsonwebtoken').sign({userId: 'test'}, 'your-secret'))"
```

### Error: `RabbitMQ connection failed`

```bash
# Verificar RabbitMQ está corriendo
docker ps | grep rabbitmq

# Verificar logs
docker logs ecommerce-rabbitmq

# Verificar conexión
curl http://localhost:15672/api/overview -u admin:admin

# Reiniciar RabbitMQ
docker restart ecommerce-rabbitmq
```

---

## Problemas de Performance

### High CPU Usage

```bash
# Identificar proceso
htop

# O con Node
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Heap snapshot
node --heapsnapshot-near-heap-limit=3 app.js
```

### Memory Leaks

```bash
# Heap dump
node -e "require('heapdump').writeSnapshot()"

# O con clinic
npx clinic doctor -- node app.js
npx clinic bubbleprof -- node app.js

# Analizar con Chrome DevTools
# 1. Generar heap snapshot
# 2. Abrir en Chrome DevTools > Memory
```

### Slow Database Queries

```sql
-- Encontrar queries lentos
SELECT 
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Habilitar logging de queries lentas
ALTER SYSTEM SET log_min_duration_statement = '1000';
```

### Redis Memory Issues

```bash
# Ver uso de memoria
redis-cli INFO memory

# Encontrar keys grandes
redis-cli --bigkeys

# Limpiar cache
redis-cli FLUSHDB

# O limpiar por pattern
redis-cli --scan --pattern "cache:*" | xargs redis-cli DEL
```

---

## Debugging

### Debug con VS Code

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Service",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["ts-node", "--transpile-only"],
      "args": ["apps/${input:service}/src/index.ts"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "ecommerce:*"
      },
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test:debug"],
      "console": "integratedTerminal"
    }
  ],
  "inputs": [
    {
      "id": "service",
      "type": "pickString",
      "description": "Select service to debug",
      "options": ["gateway", "auth-service", "product-service"]
    }
  ]
}
```

### Debug con ndb

```bash
# Instalar ndb
npm install -g ndb

# Debug aplicación
ndb node apps/gateway/src/index.ts
```

### Logging

```typescript
import { logger } from '@ecommerce/shared';

// Niveles de log
logger.debug('Debug info', { requestId, userId });
logger.info('User action', { action: 'login', userId });
logger.warn('Warning', { resource: 'rate-limit' });
logger.error('Error', { error, stack: error.stack });

// Activar debug
DEBUG=ecommerce:* npm run dev
DEBUG=ecommerce:auth:* npm run dev
```

### Tracing

```bash
# Ver traces en Jaeger
open http://localhost:16686

# Buscar por trace ID
curl http://localhost:9411/api/v2/traces?serviceName=gateway
```

---

## Recursos de Ayuda

### Comandos Útiles

```bash
# Estado del sistema
make status

# Health check de todos los servicios
make health

# Logs de todos los servicios
make logs

# Limpiar todo
make clean

# Reconstruir todo
make rebuild
```

### Scripts de Diagnóstico

```bash
#!/bin/bash
# scripts/diagnose.sh

echo "=== System Diagnosis ==="

echo "\n1. Docker Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "\n2. Service Health:"
for port in 3000 3001 3002 3003 3004 3005; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health || echo "DOWN")
  echo "Port $port: $status"
done

echo "\n3. Database Connections:"
docker exec ecommerce-postgres psql -U ecommerce -c "
  SELECT count(*), state 
  FROM pg_stat_activity 
  GROUP BY state;"

echo "\n4. Redis Memory:"
docker exec ecommerce-redis redis-cli INFO memory | grep used_memory_human

echo "\n5. Disk Usage:"
df -h | grep -E "(Filesystem|/dev/)"

echo "\n=== Diagnosis Complete ==="
```

### Dónde Buscar Ayuda

1. **Documentación**
   - [Architecture Overview](../architecture/ARCHITECTURE_OVERVIEW.md)
   - [Development Guide](DEVELOPMENT_GUIDE.md)
   - [API Specification](../architecture/API_SPECIFICATION.md)

2. **Logs**
   - Application logs: `make logs`
   - Docker logs: `docker logs <container>`
   - System logs: `journalctl -u docker`

3. **Monitoring**
   - Grafana: http://localhost:3001
   - Jaeger: http://localhost:16686
   - RabbitMQ Management: http://localhost:15672

4. **Comunidad**
   - GitHub Issues: https://github.com/company/ecommerce-platform/issues
   - Slack: #ecommerce-platform
   - Email: support@company.com

---

## Errores Específicos

### Prisma Errors

| Error | Causa | Solución |
|-------|-------|----------|
| P1000 | Authentication failed | Verificar credenciales |
| P1001 | Can't reach database | Verificar DB está corriendo |
| P1002 | Timeout | Aumentar connection timeout |
| P1003 | Database does not exist | Crear base de datos |
| P2002 | Unique constraint | Manejar duplicados |
| P2025 | Record not found | Verificar ID existe |

### Docker Errors

| Error | Causa | Solución |
|-------|-------|----------|
| port already allocated | Puerto en uso | Cambiar puerto o matar proceso |
| no space left on device | Disco lleno | `docker system prune` |
| network not found | Network eliminada | Recrear network |
| container name in use | Container existe | `docker rm <name>` |

### Node.js Errors

| Error | Causa | Solución |
|-------|-------|----------|
| MODULE_NOT_FOUND | Módulo no instalado | `npm install` |
| EADDRINUSE | Puerto en uso | Cambiar puerto |
| ENOMEM | Memoria insuficiente | Aumentar memoria o reiniciar |
| EMFILE | Demasiados archivos abiertos | Aumentar ulimit |
