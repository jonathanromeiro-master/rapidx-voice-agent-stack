#!/usr/bin/env bash
# Publish the structured Wayno BDR workflow without creating duplicates on rerun.
. "$(dirname "$0")/_common.sh"

WORKFLOW_NAME="Jonathan | BDR Wayno | Esquadrias"
WORKFLOW_FILE="$ROOT/workflows/jonathan-bdr-wayno-esquadrias.json"
TOK=$(dograh_token); export TOK

[ -f "$WORKFLOW_FILE" ] || die "Workflow definition not found: $WORKFLOW_FILE"

payload() {
  python3 - "$WORKFLOW_FILE" "$WORKFLOW_NAME" <<'PY'
import json
import sys

definition = json.load(open(sys.argv[1], encoding="utf-8"))
print(json.dumps({"name": sys.argv[2], "workflow_definition": definition}))
PY
}

WF_ID=$(api GET /api/v1/workflow/summary | python3 -c '
import json, sys
for workflow in json.load(sys.stdin):
    if workflow.get("name") == "Jonathan | BDR Wayno | Esquadrias":
        print(workflow["id"])
        break
')

if [ -n "$WF_ID" ]; then
  say "Updating workflow $WF_ID"
  api PUT "/api/v1/workflow/$WF_ID" "$(payload | python3 -c 'import json,sys; print(json.dumps({"workflow_definition": json.load(sys.stdin)["workflow_definition"]}))')" >/dev/null
else
  say "Creating the Jonathan BDR workflow"
  WF=$(api POST /api/v1/workflow/create/definition "$(payload)")
  WF_ID=$(printf '%s' "$WF" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
fi

STATUS=$(api GET "/api/v1/workflow/fetch/$WF_ID" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))')
if [ "$STATUS" != "active" ]; then
  say "Publishing workflow $WF_ID"
  api POST "/api/v1/workflow/$WF_ID/publish" >/dev/null
fi

api GET "/api/v1/workflow/fetch/$WF_ID" | python3 -c '
import json, sys
workflow = json.load(sys.stdin)
nodes = workflow["workflow_definition"]["nodes"]
assert workflow.get("status") == "active"
assert sum(node["type"] == "startCall" for node in nodes) == 1
assert sum(node["type"] == "agentNode" for node in nodes) >= 7
assert sum(node["type"] == "endCall" for node in nodes) == 3
assert all(node["data"].get("allow_interrupt") is True for node in nodes if node["type"] in {"startCall", "agentNode"})
workflow_id = workflow["id"]
print(f"workflow_id={workflow_id} status=active nodes={len(nodes)}")
'
