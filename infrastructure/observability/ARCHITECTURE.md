# Observability Stack Architecture

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           E-COMMERCE PLATFORM                                │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ API Gateway  │  │User Service  │  │Order Service │  │Payment Svc   │   │
│  │   :8080      │  │   :8081      │  │   :8083      │  │   :8084      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │            │
│         │  /metrics       │  /metrics       │  /metrics       │  /metrics  │
│         └─────────────────┴─────────────────┴─────────────────┘            │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY STACK                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        PROMETHEUS :9090                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  Scraping   │  │   Rules     │  │  Storage    │  │   Query    │ │   │
│  │  │  15s/30s    │  │  Alerts     │  │  30d ret    │  │   Engine   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                                │
│                             ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ALERTMANAGER :9093                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │   Slack     │  │  PagerDuty  │  │    Email    │  │  Webhook   │ │   │
│  │  │  #alerts    │  │  On-Call    │  │  alerts@    │  │   Custom   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
│                             ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        GRAFANA :3000                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  System     │  │  Service    │  │  Business   │  │  Custom    │ │   │
│  │  │  Overview   │  │  Metrics    │  │  Metrics    │  │  Dashboards│ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  │                                                                     │   │
│  │  Datasources: Prometheus, Loki, Jaeger, PostgreSQL, Redis          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
├─────────────────────────────┼────────────────────────────────────────────────┤
│                             │                                                │
│  ┌──────────────────────────┴──────────────────────────────────────────┐   │
│  │                          LOKI :3100                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  Log Store  │  │   Index     │  │   Query     │  │ Retention  │ │   │
│  │  │  30 days    │  │  boltdb     │  │   Engine    │  │   720h     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └──────────────────────────┬──────────────────────────────────────────┘   │
│                             │                                                │
│                             ▲                                                │
│  ┌──────────────────────────┴──────────────────────────────────────────┐   │
│  │                        PROMTAIL                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  Docker     │  │   Files     │  │   Journal   │  │   Syslog   │ │   │
│  │  │  Logs       │  │   /var/log  │  │    systemd  │  │            │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
├─────────────────────────────┼────────────────────────────────────────────────┤
│                             │                                                │
│  ┌──────────────────────────┴──────────────────────────────────────────┐   │
│  │                        JAEGER :16686                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  Collector  │  │    Query    │  │     UI      │  │   Agent    │ │   │
│  │  │  :14268     │  │   :16686    │  │   React     │  │  :6831     │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  │                                                                     │   │
│  │  Protocols: OpenTelemetry, Jaeger, Zipkin                          │   │
│  │  Storage: In-Memory (configurable: Elasticsearch, Cassandra)       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
└─────────────────────────────┴────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      INFRASTRUCTURE METRICS                                  │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │Node Exporter │  │   cAdvisor   │  │   Blackbox   │  │   StatsD     │   │
│  │   :9100      │  │   :8080      │  │   :9115      │  │   :9102      │   │
│  │  CPU/Mem/IO  │  │  Container   │  │  HTTP/TCP    │  │  App Metrics │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Flujo de Datos

### Métricas
1. **Servicios** exponen métricas en `/actuator/prometheus`
2. **Prometheus** hace scraping cada 15s/30s
3. **Reglas de alerta** evalúan condiciones
4. **Alertmanager** enruta notificaciones
5. **Grafana** visualiza datos

### Logs
1. **Promtail** recolecta logs de archivos y Docker
2. **Parsea** y enriquece con labels
3. **Envía** a Loki vía HTTP
4. **Grafana** consulta y visualiza

### Trazas
1. **Servicios** instrumentados con OpenTelemetry
2. **Jaeger Agent/Collector** recibe spans
3. **Almacena** en memoria/Elasticsearch
4. **UI** permite búsqueda y análisis

## Componentes Adicionales

### Health Check Aggregator
- **Puerto**: 8088
- **Endpoints**:
  - `/health` - Estado general
  - `/health/prometheus` - Estado Prometheus
  - `/health/grafana` - Estado Grafana
  - `/health/loki` - Estado Loki
  - `/health/jaeger` - Estado Jaeger
  - `/services` - Lista de servicios

### Exporters
| Exporter | Puerto | Métricas |
|----------|--------|----------|
| Node Exporter | 9100 | CPU, Memoria, Disco, Red |
| cAdvisor | 8080 | Métricas de contenedores |
| Blackbox | 9115 | Health checks HTTP/TCP |
| StatsD | 9102 | Métricas de aplicación |

## Redes

```
observability (bridge)
  └─ 172.28.0.0/16
     ├─ prometheus: 172.28.0.10
     ├─ grafana: 172.28.0.11
     ├─ loki: 172.28.0.12
     ├─ jaeger: 172.28.0.13
     └─ ...

ecommerce (external)
  └─ Conecta con servicios de la plataforma
```

## Almacenamiento

| Componente | Tipo | Retención | Ubicación |
|------------|------|-----------|-----------|
| Prometheus | TSDB | 30 días | prometheus-data |
| Grafana | SQLite | Persistente | grafana-data |
| Loki | Filesystem | 30 días | loki-data |
| Jaeger | In-Memory | Volátil | - |
| Alertmanager | Filesystem | Persistente | alertmanager-data |

## Escalabilidad

### Horizontal
- Prometheus: Federation o Thanos
- Loki: Modo distribuido con S3
- Grafana: Múltiples instancias con BD compartida

### Vertical
- Aumentar recursos (CPU/Memoria)
- Optimizar queries
- Ajustar retención
