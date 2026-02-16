# Installing the Uptime Kuma Operator Helm Chart

## Prerequisites

Before installing the Helm chart, you need to install the Custom Resource Definitions (CRDs).

## Step 1: Install CRDs

The CRDs must be installed before the operator. You have two options:

### Option A: Install CRDs directly with kubectl

```bash
cd operator
kubectl apply -f config/crd/bases/
```

This will install:
- `uptimekumaconfigs.monitoring.uptimekuma.io`
- `uptimekumagroups.monitoring.uptimekuma.io`
- `uptimekumamonitors.monitoring.uptimekuma.io`

### Option B: Copy CRDs to Helm chart (for bundled installation)

For a bundled installation where CRDs are installed with the chart:

```bash
# Create crds directory in helm chart
mkdir -p operator/helm/uptime-kuma-operator/crds

# Copy CRD manifests
cp operator/config/crd/bases/*.yaml operator/helm/uptime-kuma-operator/crds/
```

**Note:** Helm 3 automatically installs CRDs from the `crds/` directory before installing the chart. However, CRDs in this directory are never updated or deleted by Helm for safety reasons.

## Step 2: Install the Operator

```bash
helm install uptime-kuma-operator ./operator/helm/uptime-kuma-operator \
  --namespace uptime-kuma-system \
  --create-namespace
```

## Step 3: Verify Installation

Check that the operator pod is running:

```bash
kubectl get pods -n uptime-kuma-system
```

Check that CRDs are installed:

```bash
kubectl get crds | grep uptimekuma
```

You should see:
```
uptimekumaconfigs.monitoring.uptimekuma.io
uptimekumagroups.monitoring.uptimekuma.io
uptimekumamonitors.monitoring.uptimekuma.io
```

## Step 4: Configure the Operator

See the [README](./uptime-kuma-operator/README.md) for usage instructions.

## Building the Operator Image

To build and push the operator Docker image:

```bash
cd operator

# Build the image
make docker-build IMG=ghcr.io/benn447/uptime-kuma-operator:0.1.0

# Push the image
make docker-push IMG=ghcr.io/benn447/uptime-kuma-operator:0.1.0
```

Or use the Dockerfile directly:

```bash
cd operator
docker build -t ghcr.io/benn447/uptime-kuma-operator:0.1.0 .
docker push ghcr.io/benn447/uptime-kuma-operator:0.1.0
```

## Uninstalling

To uninstall the operator:

```bash
helm uninstall uptime-kuma-operator --namespace uptime-kuma-system
```

To remove CRDs (this will delete all custom resources):

```bash
kubectl delete crd uptimekumaconfigs.monitoring.uptimekuma.io
kubectl delete crd uptimekumagroups.monitoring.uptimekuma.io
kubectl delete crd uptimekumamonitors.monitoring.uptimekuma.io
```

## Troubleshooting

### CRDs not found

If you get errors about CRDs not being found, ensure you completed Step 1.

### Permission denied

Ensure your Kubernetes user has permissions to create ClusterRoles and CRDs.

### Operator pod not starting

Check the logs:
```bash
kubectl logs -n uptime-kuma-system -l app.kubernetes.io/name=uptime-kuma-operator
```
