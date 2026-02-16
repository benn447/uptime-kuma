# Uptime Kuma Helm Chart

A Helm chart for deploying [Uptime Kuma](https://github.com/louislam/uptime-kuma), a fancy self-hosted monitoring tool.

## Introduction

This chart bootstraps an Uptime Kuma deployment on a Kubernetes cluster using the Helm package manager.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- PV provisioner support in the underlying infrastructure (if persistence is enabled)

## Installing the Chart

To install the chart with the release name `uptime-kuma`:

```bash
helm install uptime-kuma ./helm/uptime-kuma
```

The command deploys Uptime Kuma on the Kubernetes cluster with default configuration. The [Parameters](#parameters) section lists the parameters that can be configured during installation.

## Uninstalling the Chart

To uninstall/delete the `uptime-kuma` deployment:

```bash
helm uninstall uptime-kuma
```

The command removes all the Kubernetes components associated with the chart and deletes the release.

## Parameters

### Global Parameters

| Name               | Description                                     | Value |
| ------------------ | ----------------------------------------------- | ----- |
| `nameOverride`     | String to partially override uptime-kuma.name   | `""`  |
| `fullnameOverride` | String to fully override uptime-kuma.fullname   | `""`  |

### Deployment Parameters

| Name            | Description                                              | Value  |
| --------------- | -------------------------------------------------------- | ------ |
| `useDeploy`     | Use Deployment (true) or StatefulSet (false)             | `true` |
| `replicaCount`  | Number of Uptime Kuma replicas (recommend 1 for SQLite)  | `1`    |

### Image Parameters

| Name               | Description                                       | Value                    |
| ------------------ | ------------------------------------------------- | ------------------------ |
| `image.repository` | Uptime Kuma image repository                      | `louislam/uptime-kuma`   |
| `image.tag`        | Uptime Kuma image tag (overrides appVersion)      | `"2"`                    |
| `image.pullPolicy` | Image pull policy                                 | `IfNotPresent`           |

### Service Parameters

| Name                      | Description                                | Value       |
| ------------------------- | ------------------------------------------ | ----------- |
| `service.type`            | Kubernetes service type                    | `ClusterIP` |
| `service.port`            | Service HTTP port                          | `3001`      |
| `service.nodePort`        | NodePort for service (if type=NodePort)    | `null`      |
| `service.sessionAffinity` | Session affinity (required for WebSockets) | `ClientIP`  |

### Ingress Parameters

| Name                       | Description                           | Value                   |
| -------------------------- | ------------------------------------- | ----------------------- |
| `ingress.enabled`          | Enable ingress controller resource    | `false`                 |
| `ingress.className`        | IngressClass name                     | `nginx`                 |
| `ingress.annotations`      | Ingress annotations                   | `{}`                    |
| `ingress.hosts[0].host`    | Hostname                              | `uptime-kuma.local`     |
| `ingress.hosts[0].paths`   | Path configuration                    | `[{path: /, pathType: Prefix}]` |
| `ingress.tls`              | TLS configuration                     | `[]`                    |

### Persistence Parameters

| Name                          | Description                              | Value              |
| ----------------------------- | ---------------------------------------- | ------------------ |
| `persistence.enabled`         | Enable persistence using PVC             | `true`             |
| `persistence.storageClassName`| PVC Storage Class                        | `""`               |
| `persistence.accessModes`     | PVC Access Mode                          | `[ReadWriteOnce]`  |
| `persistence.size`            | PVC Storage Request                      | `4Gi`              |
| `persistence.existingClaim`   | Use existing PVC                         | `""`               |

### Security Parameters

| Name                                    | Description                              | Value   |
| --------------------------------------- | ---------------------------------------- | ------- |
| `podSecurityContext.runAsNonRoot`       | Run as non-root user                     | `true`  |
| `podSecurityContext.runAsUser`          | User ID for the container                | `1000`  |
| `podSecurityContext.runAsGroup`         | Group ID for the container               | `1000`  |
| `podSecurityContext.fsGroup`            | Filesystem group for volumes             | `1000`  |
| `securityContext.allowPrivilegeEscalation` | Allow privilege escalation           | `false` |
| `securityContext.capabilities.drop`     | Drop capabilities                        | `[ALL]` |

### Resource Parameters

| Name                      | Description                    | Value    |
| ------------------------- | ------------------------------ | -------- |
| `resources.limits.cpu`    | CPU resource limits            | `500m`   |
| `resources.limits.memory` | Memory resource limits         | `512Mi`  |
| `resources.requests.cpu`  | CPU resource requests          | `200m`   |
| `resources.requests.memory` | Memory resource requests     | `256Mi`  |

### Health Probe Parameters

| Name                                  | Description                           | Value   |
| ------------------------------------- | ------------------------------------- | ------- |
| `livenessProbe.enabled`               | Enable liveness probe                 | `true`  |
| `livenessProbe.initialDelaySeconds`   | Initial delay seconds                 | `180`   |
| `livenessProbe.periodSeconds`         | Period seconds                        | `60`    |
| `readinessProbe.enabled`              | Enable readiness probe                | `true`  |
| `readinessProbe.initialDelaySeconds`  | Initial delay seconds                 | `30`    |
| `readinessProbe.periodSeconds`        | Period seconds                        | `10`    |
| `startupProbe.enabled`                | Enable startup probe                  | `true`  |
| `startupProbe.failureThreshold`       | Failure threshold                     | `30`    |

### ServiceMonitor Parameters

| Name                           | Description                      | Value     |
| ------------------------------ | -------------------------------- | --------- |
| `serviceMonitor.enabled`       | Enable ServiceMonitor            | `false`   |
| `serviceMonitor.interval`      | Scrape interval                  | `30s`     |
| `serviceMonitor.path`          | Metrics path                     | `/metrics`|

### NetworkPolicy Parameters

| Name                           | Description                      | Value     |
| ------------------------------ | -------------------------------- | --------- |
| `networkPolicy.enabled`        | Enable NetworkPolicy             | `false`   |
| `networkPolicy.allowExternal`  | Allow external traffic           | `true`    |

## Configuration Examples

### Basic Installation (SQLite)

The default installation uses SQLite database with persistent storage:

```bash
helm install uptime-kuma ./helm/uptime-kuma
```

### Installation with Ingress

Create a `values-ingress.yaml` file:

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: uptime.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: uptime-tls
      hosts:
        - uptime.example.com
```

Install with custom values:

```bash
helm install uptime-kuma ./helm/uptime-kuma -f values-ingress.yaml
```

### Installation with External MariaDB

Create a `values-mariadb.yaml` file:

```yaml
env:
  - name: UPTIME_KUMA_DB_TYPE
    value: "mariadb"
  - name: UPTIME_KUMA_DB_HOSTNAME
    value: "mariadb.database.svc.cluster.local"
  - name: UPTIME_KUMA_DB_PORT
    value: "3306"
  - name: UPTIME_KUMA_DB_NAME
    value: "uptime_kuma"
  - name: UPTIME_KUMA_DB_USERNAME
    value: "uptime"
  - name: UPTIME_KUMA_DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: mariadb-secret
        key: password
```

Install with custom values:

```bash
helm install uptime-kuma ./helm/uptime-kuma -f values-mariadb.yaml
```

### StatefulSet Mode

For scenarios requiring StatefulSet (e.g., multiple replicas with individual storage):

```yaml
useDeploy: false
persistence:
  enabled: true
  size: 10Gi
  storageClass: "fast-ssd"
```

## WebSocket Support

Uptime Kuma requires WebSocket connections for real-time updates. This chart ensures WebSocket support through:

1. **Service Configuration**: `sessionAffinity: ClientIP` ensures requests from the same client are routed to the same pod.

2. **Ingress Annotations**: When using nginx ingress controller, WebSocket-specific annotations are pre-configured:
   ```yaml
   nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
   nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
   ```

If using a different ingress controller, ensure it's configured to support WebSocket connections.

## Database Configuration

### SQLite (Default)

By default, Uptime Kuma uses SQLite stored in the persistent volume at `/app/data`. This is suitable for most deployments.

**Important**: SQLite does not support multiple replicas. Keep `replicaCount: 1` when using SQLite.

### MariaDB/MySQL

For production deployments or when multiple replicas are needed, configure an external MariaDB/MySQL database:

```yaml
env:
  - name: UPTIME_KUMA_DB_TYPE
    value: "mariadb"
  - name: UPTIME_KUMA_DB_HOSTNAME
    value: "your-mysql-host"
  - name: UPTIME_KUMA_DB_PORT
    value: "3306"
  - name: UPTIME_KUMA_DB_NAME
    value: "uptime_kuma"
  - name: UPTIME_KUMA_DB_USERNAME
    value: "username"
  - name: UPTIME_KUMA_DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: password
```

## Persistence

By default, persistence is enabled and a PersistentVolumeClaim is created. If you want to disable persistence:

```yaml
persistence:
  enabled: false
```

**Warning**: Disabling persistence will result in data loss when pods are restarted.

To use an existing PersistentVolumeClaim:

```yaml
persistence:
  enabled: true
  existingClaim: "my-existing-pvc"
```

## Upgrading

### To 1.1.0

No breaking changes.

## Troubleshooting

### WebSocket Connection Issues

If you experience WebSocket connection issues:

1. Verify `service.sessionAffinity` is set to `ClientIP`
2. Check ingress controller logs for WebSocket upgrade errors
3. Ensure ingress timeout annotations are properly set
4. Verify firewall/proxy settings allow WebSocket connections

### Pod Fails to Start

1. Check pod logs: `kubectl logs -l app.kubernetes.io/name=uptime-kuma`
2. Verify persistent volume is properly bound
3. Check security contexts and permissions
4. Ensure sufficient resources are available

### Database Connection Errors

If using external database:
1. Verify database credentials in secrets
2. Check network connectivity from pod to database
3. Ensure database is created and accessible
4. Verify database type is correctly set

## Support

For issues specific to this Helm chart, please open an issue at [https://github.com/louislam/uptime-kuma/issues](https://github.com/louislam/uptime-kuma/issues).

For Uptime Kuma application issues, see [https://github.com/louislam/uptime-kuma](https://github.com/louislam/uptime-kuma).

## License

This chart is licensed under the MIT License. See the main Uptime Kuma repository for application license details.
