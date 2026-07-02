#!/usr/bin/env bash
# Provisiona a infra de storage dos DOCUMENTOS DE CLIENTE (PII: RG/CNH) do aja-agora.
#
# Contexto: o upload de documento do cliente (rota /api/chat/document → FIX-82)
# grava num bucket S3 DEDICADO com SSE-KMS, separado do bucket da administradora
# (aja-agora-docs-*). Esse bucket + KMS + IAM + env eram "PENDENTE-KAIRO" e nunca
# tinham sido provisionados → o upload em dev e prod falhava:
#   ensureBucket → HeadBucket 404 (bucket inexistente) → CreateBucket → AccessDenied.
# Ver docs/correcoes/decisions/2026-07-01-storage-documentos-cliente-prod.md.
#
# Este script é a fonte de verdade (IaC-by-CLI — o projeto não usa Terraform).
# É IDEMPOTENTE: reusa recursos existentes; rodar de novo não duplica nada.
#
# Cria/garante, por ambiente:
#   - CMK KMS dedicada (alias/aja-client-docs-<env>) com rotação automática;
#   - bucket S3 aja-client-docs-<env>: Block Public Access total, SSE-KMS default
#     (com a CMK) + Bucket Key, bucket policy negando tráfego não-TLS;
#   - IAM na task role ecs-task-aja-agora-<env>: S3 (Get/Put/Delete + ListBucket)
#     escopado ao bucket + KMS (GenerateDataKey/Encrypt/Decrypt/DescribeKey) na CMK;
#   - env S3_CLIENT_DOCS_BUCKET / S3_CLIENT_DOCS_KMS_KEY_ID na task def + redeploy.
#
# Uso:
#   ./scripts/infra/provision-client-docs.sh dev  tb-dev
#   ./scripts/infra/provision-client-docs.sh prod tb-prod
set -euo pipefail

ENVN="${1:?uso: provision-client-docs.sh <dev|prod> <perfil-aws>}"
PROFILE="${2:?informe o perfil AWS (tb-dev|tb-prod)}"
REGION="sa-east-1"
BUCKET="aja-client-docs-${ENVN}"
ALIAS="alias/aja-client-docs-${ENVN}"
ROLE="ecs-task-aja-agora-${ENVN}"
FAMILY="aja-agora-${ENVN}"
CLUSTER="tb-cluster"
SERVICE="aja-agora-${ENVN}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export AWS_PAGER="" AWS_PROFILE="$PROFILE" AWS_REGION="$REGION"

echo "================ PROVISIONAMENTO [$ENVN] (perfil $PROFILE) ================"

########## 1) KMS CMK dedicada ##########
echo "--- [1/5] KMS CMK ($ALIAS) ---"
KEY_ARN="$(aws kms describe-key --key-id "$ALIAS" --query 'KeyMetadata.Arn' --output text 2>/dev/null || true)"
if [ -z "$KEY_ARN" ] || [ "$KEY_ARN" = "None" ]; then
  KEY_ID="$(aws kms create-key \
      --description "SSE-KMS documentos de cliente (PII RG/CNH) aja-agora ${ENVN}" \
      --tags TagKey=Project,TagValue=aja-agora TagKey=Env,TagValue="${ENVN}" TagKey=DataClass,TagValue=pii-identidade \
      --query 'KeyMetadata.KeyId' --output text)"
  aws kms enable-key-rotation --key-id "$KEY_ID"
  aws kms create-alias --alias-name "$ALIAS" --target-key-id "$KEY_ID"
  KEY_ARN="$(aws kms describe-key --key-id "$KEY_ID" --query 'KeyMetadata.Arn' --output text)"
  echo "    CMK criada: $KEY_ARN (rotação habilitada)"
else
  echo "    CMK já existe: $KEY_ARN"
fi

########## 2) Bucket S3 ##########
echo "--- [2/5] Bucket S3 ($BUCKET) ---"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "    bucket já existe"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  echo "    bucket criado"
fi
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
cat > "$TMP/enc.json" <<JSON
{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms","KMSMasterKeyID":"$KEY_ARN"},"BucketKeyEnabled":true}]}
JSON
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration "file://$TMP/enc.json"
cat > "$TMP/bpol.json" <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"DenyInsecureTransport","Effect":"Deny","Principal":"*","Action":"s3:*","Resource":["arn:aws:s3:::$BUCKET","arn:aws:s3:::$BUCKET/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}
JSON
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$TMP/bpol.json"
echo "    BPA total + SSE-KMS(BucketKey) + TLS-only aplicados"

########## 3) IAM policy da task role (append idempotente) ##########
echo "--- [3/5] IAM policy da role ($ROLE) ---"
aws iam get-role-policy --role-name "$ROLE" --policy-name app-permissions \
  --query 'PolicyDocument' --output json > "$TMP/pol_cur.json"
BUCKET="$BUCKET" KEY_ARN="$KEY_ARN" python3 - "$TMP/pol_cur.json" "$TMP/pol_new.json" <<'PY'
import json, os, sys
cur = json.load(open(sys.argv[1]))
bucket = os.environ["BUCKET"]; key = os.environ["KEY_ARN"]
obj_arn = f"arn:aws:s3:::{bucket}/*"; buc_arn = f"arn:aws:s3:::{bucket}"
stmts = cur.setdefault("Statement", [])
def has_resource(res):
    for s in stmts:
        r = s.get("Resource"); rs = r if isinstance(r, list) else [r]
        if res in rs: return True
    return False
added = []
if not has_resource(obj_arn):
    stmts.append({"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":obj_arn}); added.append("s3 object rw")
if not has_resource(buc_arn):
    stmts.append({"Effect":"Allow","Action":["s3:ListBucket"],"Resource":buc_arn}); added.append("s3 list")
if not has_resource(key):
    stmts.append({"Effect":"Allow","Action":["kms:GenerateDataKey","kms:Encrypt","kms:Decrypt","kms:DescribeKey"],"Resource":key}); added.append("kms")
json.dump(cur, open(sys.argv[2],"w"), indent=2)
print("    statements adicionados:", added or "(nenhum — já presentes)")
PY
aws iam put-role-policy --role-name "$ROLE" --policy-name app-permissions \
  --policy-document "file://$TMP/pol_new.json"
echo "    policy atualizada"

########## 4) Task definition: env S3_CLIENT_DOCS_* ##########
echo "--- [4/5] Task def ($FAMILY): env S3_CLIENT_DOCS_* ---"
aws ecs describe-task-definition --task-definition "$FAMILY" \
  --query 'taskDefinition' --output json > "$TMP/td_cur.json"
BUCKET_ENV="$BUCKET" KEY_ARN="$KEY_ARN" python3 - "$TMP/td_cur.json" "$TMP/td_new.json" <<'PY'
import json, os, sys
td = json.load(open(sys.argv[1]))
bucket = os.environ["BUCKET_ENV"]; key = os.environ["KEY_ARN"]
for k in ["taskDefinitionArn","revision","status","requiresAttributes","compatibilities",
          "registeredAt","registeredBy","deregisteredAt"]:
    td.pop(k, None)
c = td["containerDefinitions"][0]
env = c.setdefault("environment", [])
want = {"S3_CLIENT_DOCS_BUCKET": bucket, "S3_CLIENT_DOCS_KMS_KEY_ID": key}
by = {e["name"]: e for e in env}
for name, val in want.items():
    (by[name].__setitem__("value", val) if name in by else env.append({"name": name, "value": val}))
json.dump(td, open(sys.argv[2],"w"))
print("    env S3_CLIENT_DOCS_BUCKET =", bucket)
print("    env S3_CLIENT_DOCS_KMS_KEY_ID =", key)
PY
NEW_TD_ARN="$(aws ecs register-task-definition --cli-input-json "file://$TMP/td_new.json" \
  --query 'taskDefinition.taskDefinitionArn' --output text)"
echo "    nova revisão: $NEW_TD_ARN"

########## 5) Update service (force new deployment) ##########
echo "--- [5/5] update-service ($SERVICE) ---"
aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --task-definition "$NEW_TD_ARN" --force-new-deployment \
  --query 'service.{service:serviceName,taskDef:taskDefinition,desired:desiredCount}' --output json
echo "================ [$ENVN] OK ================"
