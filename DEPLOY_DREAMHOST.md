# DreamHost deployment (fully automated from GitHub)

This is the simplest path if you do **not** want to run local terminal commands.

## What is now automated

A GitHub Actions workflow (`.github/workflows/deploy-dreamhost.yml`) deploys your repo to DreamHost automatically.

On each push to `main` (or manual workflow run), it will:

1. SSH into DreamHost
2. Sync this repo on DreamHost directly from GitHub (fast pull/clone)
3. Build (`npm ci && npm run build`) on DreamHost
4. Publish `dist/` into your web directory
5. Copy SPA fallback `.htaccess`
6. Optionally verify via IP/domain host header

## One-time setup in GitHub (no coding required)

Open your GitHub repo in browser:

1. Click **Settings** (repo settings, not Advanced Security).
2. In the left sidebar under **Security**, click **Secrets and variables** → **Actions**.
3. Click **New repository secret** and add the values below.

If you do not see **Secrets and variables**, usually one of these is true:
- you are not an admin on this repository, or
- GitHub Actions is disabled for the repository/org.

In that case, ask the repo owner to grant admin access or enable Actions first, then add these secrets exactly:

- `DREAMHOST_HOST` = `vps68725.dreamhostps.com`
- `DREAMHOST_USER` = `parkertheemmerson`
- `DREAMHOST_REMOTE` = `parkertheemmerson@vps68725.dreamhostps.com` *(optional shortcut instead of host+user)*
- `DREAMHOST_PASSWORD` = `htl!2026` (or use SSH key secrets below)
- `DREAMHOST_APP_DIR` = `/home/parkertheemmerson/apps/social-archive`
- `DREAMHOST_WEB_ROOT` = `/home/parkertheemmerson/adaywithoutabillionaire.net`
- `DREAMHOST_IP_WEB_ROOT` = `/home/parkertheemmerson` *(optional, for direct IP root publishing)*
- `DREAMHOST_PUBLIC_IP` = `69.163.205.13`
- `DREAMHOST_SSH_PRIVATE_KEY` = *(optional)* OpenSSH private key for DreamHost auth
- `DREAMHOST_SSH_PASSPHRASE` = *(optional)* key passphrase (if your key uses one)
- `DREAMHOST_SSH_PUBLIC_KEY` = *(optional but recommended with key auth)* matching public key to auto-install in `authorized_keys`
- `DREAMHOST_HOST_HEADER` = `adaywithoutabillionaire.net`


## SSH key auth (recommended)

The workflow supports either password auth (`DREAMHOST_PASSWORD`) or key auth (`DREAMHOST_SSH_PRIVATE_KEY`). You can provide SSH target as either `DREAMHOST_REMOTE` (`user@host`) or as separate `DREAMHOST_USER` + `DREAMHOST_HOST`.

If you use key auth:
1. Add the private key content to GitHub secret `DREAMHOST_SSH_PRIVATE_KEY`.
2. Add the matching public key to `DREAMHOST_SSH_PUBLIC_KEY` (workflow auto-installs it into `~/.ssh/authorized_keys`).
3. If encrypted, add `DREAMHOST_SSH_PASSPHRASE`.

## Run deployment

Option A (automatic): push any commit to `main`.

Option B (manual):
- GitHub repo → **Actions** → **Deploy to DreamHost** → **Run workflow**.


## If a run says “cancelled”

A cancelled run is usually not a YAML error. Most often it means another run replaced it, or someone clicked cancel while it was still installing packages/syncing files.

- Re-run from **Actions → Deploy to DreamHost → Run workflow**.
- Wait for the **deploy** job to finish (it can take a few minutes while `apt-get`, `git fetch/clone`, and `npm ci` run).
- If it fails again, open the run and copy the exact failing step name/error.

## Edit code directly on DreamHost after deployment

SSH in:

```bash
ssh parkertheemmerson@vps68725.dreamhostps.com
cd /home/parkertheemmerson/apps/social-archive
```

After editing files on the server, republish with:

```bash
./publish-on-dreamhost.sh
```



## Regular IP preview support

To support viewing by raw server IP, the workflow can also publish to `DREAMHOST_IP_WEB_ROOT` (defaults to `$HOME` if unset).

For your VPS this means the workflow will try to place the built app at:
- `http://69.163.205.13/`
- `http://69.163.205.13/great/`

It also writes `deploy-marker.txt` into each publish root so support can quickly confirm which directory is being updated.

## Temporary preview path

The workflow also publishes the built site to `great/` under your web root for quick testing:

- `http://www.adaywithoutabillionaire.net/great/`

If the root domain still shows DreamHost parking, this preview path helps confirm published files are reachable through your active web directory.

## Existing script options (optional)

If you ever want CLI deployment as fallback, scripts are still available:

- `scripts/deploy-dreamhost-automated.sh`
- `scripts/deploy-dreamhost.sh`


## If you only see “Deploy keys”

That page is different from Actions secrets. Deploy keys are SSH keys attached to a repo and do **not** replace workflow secrets by themselves.

Use Deploy keys only if you want DreamHost to `git pull` directly from GitHub via SSH. For this workflow (`.github/workflows/deploy-dreamhost.yml`), you still need repository **Actions secrets** because the job reads `${{ secrets.* }}` values at runtime.
