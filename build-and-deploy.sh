#!/bin/bash
set -e

REGISTRY="10.0.0.15:5001"
KUMA_IMAGE="uptime-kuma"
OPERATOR_IMAGE="uptime-kuma-operator"

KUMA_TAG="${1:-rest-api-v4}"
OPERATOR_TAG="${2:-0.2.0}"

echo "===================================="
echo "Building and deploying:"
echo "  Uptime Kuma:  ${REGISTRY}/${KUMA_IMAGE}:${KUMA_TAG}"
echo "  Operator:     ${REGISTRY}/${OPERATOR_IMAGE}:${OPERATOR_TAG}"
echo "===================================="

# Build Uptime Kuma
echo ""
echo "[1/6] Building Uptime Kuma image..."
docker build -f Dockerfile.rest-api -t "${REGISTRY}/${KUMA_IMAGE}:${KUMA_TAG}" .

# Build Operator
echo ""
echo "[2/6] Building Operator image..."
docker build -f operator/Dockerfile -t "${REGISTRY}/${OPERATOR_IMAGE}:${OPERATOR_TAG}" ./operator

# Push Uptime Kuma
echo ""
echo "[3/6] Pushing Uptime Kuma image..."
docker push "${REGISTRY}/${KUMA_IMAGE}:${KUMA_TAG}"

# Push Operator
echo ""
echo "[4/6] Pushing Operator image..."
docker push "${REGISTRY}/${OPERATOR_IMAGE}:${OPERATOR_TAG}"

# Update Uptime Kuma deployment
echo ""
echo "[5/6] Updating Uptime Kuma deployment..."
kubectl set image deployment/uptime-kuma \
  uptime-kuma="${REGISTRY}/${KUMA_IMAGE}:${KUMA_TAG}" \
  -n monitoring
kubectl rollout status deployment/uptime-kuma -n monitoring

# Update Operator deployment
echo ""
echo "[6/6] Updating Operator deployment..."
kubectl set image deployment/uptime-kuma-operator \
  manager="${REGISTRY}/${OPERATOR_IMAGE}:${OPERATOR_TAG}" \
  -n uptime-kuma-system
kubectl rollout status deployment/uptime-kuma-operator -n uptime-kuma-system

echo ""
echo "===================================="
echo "Deployment complete!"
echo "  Uptime Kuma:  ${REGISTRY}/${KUMA_IMAGE}:${KUMA_TAG}"
echo "  Operator:     ${REGISTRY}/${OPERATOR_IMAGE}:${OPERATOR_TAG}"
echo "===================================="
