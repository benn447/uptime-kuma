# Uptime Kuma Operator Helm Chart

This Helm chart deploys the Uptime Kuma Operator to Kubernetes, enabling declarative monitor management and auto-discovery of services.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- An Uptime Kuma instance with REST API enabled

## Installing the Chart

```bash
# Install from local directory
helm install uptime-kuma-operator ./operator/helm/uptime-kuma-operator \
  --namespace uptime-kuma-system \
  --create-namespace

# Or install with custom values
helm install uptime-kuma-operator ./operator/helm/uptime-kuma-operator \
  --namespace uptime-kuma-system \
  --create-namespace \
  --values custom-values.yaml
```

## Configuration

The following table lists the configurable parameters of the chart and their default values.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of operator replicas | `1` |
| `image.repository` | Operator image repository | `ghcr.io/benn447/uptime-kuma-operator` |
| `image.tag` | Operator image tag | `0.1.0` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `rbac.create` | Create RBAC resources | `true` |
| `rbac.clusterScoped` | Use ClusterRole (cluster-wide) vs Role (namespace-scoped) | `true` |
| `serviceAccount.create` | Create ServiceAccount | `true` |
| `resources.limits.cpu` | CPU limit | `500m` |
| `resources.limits.memory` | Memory limit | `256Mi` |
| `resources.requests.cpu` | CPU request | `100m` |
| `resources.requests.memory` | Memory request | `64Mi` |
| `leaderElection.enabled` | Enable leader election | `true` |

## Usage

### 1. Create an API Key in Uptime Kuma

First, create an API key in your Uptime Kuma instance (via the web UI).

### 2. Create a Secret with the API Key

```bash
kubectl create secret generic uptime-kuma-api-key \
  --from-literal=api-key=your-api-key-here \
  --namespace your-namespace
```

### 3. Create an UptimeKumaConfig Resource

```yaml
apiVersion: monitoring.uptimekuma.io/v1alpha1
kind: UptimeKumaConfig
metadata:
  name: uptime-kuma
  namespace: your-namespace
spec:
  apiUrl: http://uptime-kuma:3001
  apiKeySecret:
    name: uptime-kuma-api-key
    key: api-key
```

### 4. Create Monitors

**Manually create a monitor:**

```yaml
apiVersion: monitoring.uptimekuma.io/v1alpha1
kind: UptimeKumaMonitor
metadata:
  name: google-monitor
  namespace: your-namespace
spec:
  monitorType: http
  url: https://www.google.com
  interval: 60
  active: true
```

**Auto-discover from Services:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  annotations:
    monitoring.uptimekuma.io/enabled: "true"
    monitoring.uptimekuma.io/path: "/health"
    monitoring.uptimekuma.io/interval: "30"
spec:
  ports:
    - name: http
      port: 8080
  selector:
    app: my-app
```

The operator will automatically create a monitor for this service!

### 5. Create Groups

```yaml
apiVersion: monitoring.uptimekuma.io/v1alpha1
kind: UptimeKumaGroup
metadata:
  name: production-services
  namespace: your-namespace
spec:
  groupName: "Production Services"
  description: "All production service monitors"
```

Then reference the group in monitors:

```yaml
apiVersion: monitoring.uptimekuma.io/v1alpha1
kind: UptimeKumaMonitor
metadata:
  name: my-monitor
spec:
  # ...
  group: production-services
```

## Uninstalling the Chart

```bash
helm uninstall uptime-kuma-operator --namespace uptime-kuma-system
```

**Note:** This will not delete the CRDs. To delete CRDs:

```bash
kubectl delete crd uptimekumamonitors.monitoring.uptimekuma.io
kubectl delete crd uptimekumagroups.monitoring.uptimekuma.io
kubectl delete crd uptimekumaconfigs.monitoring.uptimekuma.io
```

## Service Discovery Annotations

The operator watches Kubernetes Services with the following annotations:

| Annotation | Description | Default |
|------------|-------------|---------|
| `monitoring.uptimekuma.io/enabled` | Enable monitoring for this service (required) | - |
| `monitoring.uptimekuma.io/type` | Monitor type | `http` |
| `monitoring.uptimekuma.io/path` | URL path to append | `/` |
| `monitoring.uptimekuma.io/port` | Port name or number | `http` or first port |
| `monitoring.uptimekuma.io/interval` | Check interval in seconds | `60` |
| `monitoring.uptimekuma.io/group` | Group to assign monitor to | - |
| `monitoring.uptimekuma.io/config` | UptimeKumaConfig to use | `uptime-kuma` |

## Troubleshooting

View operator logs:
```bash
kubectl logs -n uptime-kuma-system -l app.kubernetes.io/name=uptime-kuma-operator
```

Check CR status:
```bash
kubectl describe uptimekumaconfig uptime-kuma -n your-namespace
kubectl describe uptimekumamonitor google-monitor -n your-namespace
```

## License

Apache License 2.0
