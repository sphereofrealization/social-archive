# Base44 App

## Deployment

- Main guide: `DEPLOY_DREAMHOST.md`
- Zero-local workflow (recommended): GitHub Actions deploy via `.github/workflows/deploy-dreamhost.yml`
- Optional CLI scripts:
  - `./scripts/deploy-dreamhost-automated.sh <dreamhost_user@host> <remote_web_root> <remote_app_dir> <github_repo_url> [branch] [public_ip] [host_header]`
  - `./scripts/deploy-dreamhost.sh <dreamhost_user@host> <remote_web_root> <public_ip> [host_header]`


> If you can’t find **Secrets and variables** in GitHub settings, check `DEPLOY_DREAMHOST.md` troubleshooting for permissions/Actions enablement.
