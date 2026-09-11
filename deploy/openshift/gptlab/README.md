# Adding GPT-Lab services

Keep Counterpart as the first in-cluster product. Additional services should be **new folders**, not edits to the Counterpart app.

1. Copy this directory to `deploy/openshift/gptlab/<service-name>/`.
2. Add a Deployment + Service. Default to CPU. Request `nvidia.com/gpu` only if that process loads a model.
3. Label resources:
   - `app.kubernetes.io/part-of: gptlab`
   - `app.kubernetes.io/name: <service-name>`
4. List the folder in `deploy/openshift/kustomization.yaml` `resources`.
5. If Counterpart should call it, set an env URL on `counterpart-config` (for example `AI_BASE_URL=http://<service-name>:8000/v1`). No Counterpart code change is needed when the service is OpenAI-compatible.

The `kustomization.yaml` here is an empty stub so the folder is a valid Kustomize root.
