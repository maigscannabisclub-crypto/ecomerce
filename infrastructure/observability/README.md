# E-commerce Platform Observability Stack

Stack completo de observabilidad para la plataforma e-commerce, incluyendo métricas, logs, trazas y alertas.

## 📋 Componentes

| Componente | Descripción | Puerto | URL |
|------------|-------------|--------|-----|
| **Prometheus** | Recolección y almacenamiento de métricas | 9090 | http://localhost:9090 |
| **Grafana** | Visualización de dashboards | 3000 | http://localhost:3000 |
| **Loki** | Agregación de logs | 3100 | http://localhost:3100 |
| **Promtail** | Recolección de logs | 9080 | - |
| **Jaeger** | Distributed tracing | 16686 | http://localhost:16686 |
| **Alertmanager** | Gestión de alertas | 9093 | http://localhost:9093 |

## 🚀 Instalación Rápida

```bash
# Ejecutar el script de setup
./scripts/setup.sh

# O paso a paso:
docker-compose -f docker-compose.observability.yml up -d
```

## 📁 Estructura del Proyecto

```
infrastructure/observability/
├── prometheus/
│   ├── prometheus.yml          # Configuración principal
│   ├── alert_rules.yml         # Reglas de alertas
│   └── targets/                # Targets adicionales
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/        # Configuración de datasources
│   │   └── dashboards/         # Configuración de dashboards
│   └── dashboards/             # Dashboards JSON
│       ├── system-overview.json
│       ├── service-metrics.json
│       └── business-metrics.json
├── loki/
│   └── loki-config.yml         # Configuración de Loki
├── promtail/
│   └── promtail-config.yml     # Configuración de Promtail
├── jaeger/
│   ├── jaeger-config.yml       # Configuración de Jaeger
│   └── sampling-strategies.json # Estrategias de sampling
├── alertmanager/
│   └── alertmanager.yml        # Configuración de alertas
├── blackbox/
│   └── blackbox-config.yml     # Health checks
├── health-check/
│   ├── nginx.conf              # Configuración del aggregator
│   └── health-check.sh         # Script de verificación
├── statsd/
│   └── statsd-mapping.conf     # Mapeo StatsD a Prometheus
├── scripts/
│   └── setup.sh                # Script de instalación
├── docker-compose.observability.yml
└── README.md
```

## 🔧 Configuración

### Variables de Entorno

Crear archivo `.env` con las siguientes variables:

```bash
# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=changeme-strong-password
GRAFANA_SECRET_KEY=your-secret-key

# Notificaciones
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
PAGERDUTY_KEY=your-pagerduty-key
EMAIL_PASSWORD=your-email-password

# SMTP
GF_SMTP_ENABLED=true
GF_SMTP_HOST=smtp.gmail.com:587
GF_SMTP_USER=alerts@ecommerce.com
GF_SMTP_PASSWORD=your-smtp-password
```

### Métricas Exponer en Servicios

Cada servicio debe exponer métricas en formato Prometheus:

```
# Métricas HTTP
http_requests_total{service="order-service",method="POST",status="200"} 1024
http_request_duration_seconds_bucket{service="order-service",le="0.1"} 950
http_request_errors_total{service="order-service",status="500"} 5

# Métricas de conexiones
active_connections{service="order-service"} 42

# Métricas de base de datos
database_query_duration_seconds_bucket{service="order-service",operation="SELECT",le="0.01"} 850

# Métricas de cache
cache_hit_ratio{cache="product-cache"} 0.85

# Métricas de colas
message_queue_size{queue="order-queue"} 150
```

## 📊 Dashboards

### System Overview
- CPU, Memoria, Disco, Red
- Estado de servicios
- Métricas de sistema

### Service Metrics
- Request rate por servicio
- Latencia (p50, p95, p99)
- Error rate
- Database query latency
- Cache hit ratio

### Business Metrics
- Órdenes por hora
- Revenue
- Conversion rate
- Cart abandonment
- Payment failure rate

## 🚨 Alertas Configuradas

### Disponibilidad
| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| ServiceDown | up == 0 por 1m | critical |
| ServiceUnresponsive | up == 0 por 5m | critical |

### Errores
| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| HighErrorRate | > 5% errores en 5m | warning |
| CriticalErrorRate | > 10% errores en 5m | critical |
| PaymentServiceErrors | > 1% errores en payment | critical |

### Latencia
| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| HighLatency | p95 > 500ms por 3m | warning |
| CriticalLatency | p95 > 1000ms por 2m | critical |
| DatabaseSlowQueries | p95 > 100ms por 5m | warning |

### Recursos
| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| HighCPUUsage | > 80% por 5m | warning |
| CriticalCPUUsage | > 95% por 2m | critical |
| HighMemoryUsage | > 85% por 5m | warning |
| CriticalMemoryUsage | > 95% por 2m | critical |
| DiskSpaceLow | < 10% disponible | warning |

### Negocio
| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| OrderDrop | < 50% vs ayer por 15m | warning |
| PaymentFailureRate | > 10% fallos por 5m | critical |
| HighCartAbandonment | > 70% por 30m | warning |

## 🔍 Logging

### Estructura de Logs

Los servicios deben emitir logs en formato JSON:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "service": "order-service",
  "trace_id": "abc123def456",
  "span_id": "span789",
  "user_id": "user123",
  "message": "Order created successfully",
  "order_id": "ORD-12345",
  "duration_ms": 45
}
```

### Búsqueda en Loki

```bash
# Logs de un servicio específico
{service="order-service"}

# Logs con error
{service="order-service"} |= "ERROR"

# Logs de un trace específico
{service="order-service"} |= "trace_id=\"abc123\""

# Logs de un usuario
{service="order-service"} |= "user_id=\"user123\""
```

## 🔗 Distributed Tracing

### Instrumentación

Los servicios deben propagar headers de trazabilidad:

```
utrace-id: <unique-trace-id>
parent-span-id: <parent-span-id>
span-id: <current-span-id>
sampled: <1|0>
```

### Jaeger UI

- Buscar trazas por servicio, operación, tags
- Ver timeline de spans
- Analizar dependencias entre servicios
- Identificar cuellos de botella

## 🛠️ Comandos Útiles

```bash
# Iniciar stack
./scripts/setup.sh start

# Ver estado
./scripts/setup.sh status

# Ver logs
./scripts/setup.sh logs [servicio]

# Reiniciar
./scripts/setup.sh restart

# Actualizar imágenes
./scripts/setup.sh update

# Detener
./scripts/setup.sh stop

# Limpiar todo
./scripts/setup.sh cleanup
```

### Docker Compose Directo

```bash
# Iniciar
docker-compose -f docker-compose.observability.yml up -d

# Escalar servicio
docker-compose -f docker-compose.observability.yml up -d --scale prometheus=2

# Logs
docker-compose -f docker-compose.observability.yml logs -f prometheus

# Reiniciar servicio
docker-compose -f docker-compose.observability.yml restart grafana
```

## 📈 Métricas de Negocio

### Implementación

```python
# Ejemplo en Python con prometheus_client
from prometheus_client import Counter, Histogram, Gauge

# Contadores
orders_created = Counter('orders_created_total', 'Total orders created', ['status'])
order_value = Counter('order_value_total', 'Total order value', ['currency'])

# Histogramas
order_processing_time = Histogram('order_processing_seconds', 'Order processing time')

# Gauges
active_carts = Gauge('active_carts', 'Number of active carts')

# Uso
def create_order(order_data):
    with order_processing_time.time():
        # procesar orden
        orders_created.labels(status='success').inc()
        order_value.labels(currency='USD').inc(order_data['total'])
```

## 🔐 Seguridad

### Recomendaciones

1. **Cambiar contraseñas por defecto**
2. **Habilitar HTTPS** en producción
3. **Configurar autenticación** en Prometheus/Loki
4. **Restringir acceso** a redes internas
5. **Rotar credenciales** regularmente

### Configuración TLS

```yaml
# prometheus.yml
tls_config:
  cert_file: /etc/prometheus/server.crt
  key_file: /etc/prometheus/server.key
```

## 🔧 Troubleshooting

### Prometheus no inicia
```bash
# Verificar configuración
docker-compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Ver logs
docker-compose logs prometheus
```

### Grafana no muestra datos
```bash
# Verificar datasources
curl http://admin:admin@localhost:3000/api/datasources

# Verificar conectividad
docker-compose exec grafana wget -O- http://prometheus:9090
```

### Loki no recibe logs
```bash
# Verificar Promtail
docker-compose logs promtail

# Verificar posiciones
docker-compose exec promtail cat /tmp/positions.yaml
```

## 📚 Recursos

- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)
- [Loki Docs](https://grafana.com/docs/loki/)
- [Jaeger Docs](https://www.jaegertracing.io/docs/)
- [OpenTelemetry](https://opentelemetry.io/)

## 📝 Licencia

Este proyecto es parte de la plataforma e-commerce y está sujeto a sus términos de licencia.
