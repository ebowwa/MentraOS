# Self-Hosted Runner Guide for MentraOS

## Overview

This guide helps you set up and maintain self-hosted GitHub Actions runners for MentraOS builds.

## Key Issues and Solutions

### 1. PNPM Store Permission Issues

**Problem**: `ERR_PNPM_ENOENT` errors when pnpm tries to use global store paths.

**Solution**: Configure pnpm to use project-local stores:

```yaml
- name: Configure pnpm store
  working-directory: ./mobile
  run: |
    pnpm config set store-dir .pnpm-store

- name: Install dependencies
  working-directory: ./mobile
  run: pnpm install --no-frozen-lockfile
  env:
    PNPM_HOME: ${{ github.workspace }}/mobile/.pnpm
    PNPM_STORE_PATH: ${{ github.workspace }}/mobile/.pnpm-store
```

### 2. Runner Cleanup

Self-hosted runners persist state between runs. Clean workspaces regularly:

```bash
# Run on the self-hosted runner VM
chmod +x .github/scripts/clean-runner.sh
.github/scripts/clean-runner.sh
```

### 3. Concurrent Jobs

By default, one runner = one job at a time. For parallel builds:

```bash
# Install multiple runners on same VM
cd ~
for i in {1..3}; do
  mkdir actions-runner-$i && cd actions-runner-$i
  curl -o actions-runner-linux-x64-2.326.0.tar.gz -L [runner-url]
  tar xzf actions-runner-linux-x64-2.326.0.tar.gz
  ./config.sh --url https://github.com/Mentra-Community/MentraOS --token [TOKEN] --name "runner-$i"
  sudo ./svc.sh install
  sudo ./svc.sh start
  cd ..
done
```

### 4. Best Practices

1. **Use local stores**: Avoid global pnpm/npm stores
2. **Clean workspaces**: Remove build artifacts between runs
3. **Monitor disk space**: Android builds use lots of space
4. **Label runners**: Use labels like `android`, `heavy-build`
5. **Fallback strategy**: Keep some jobs on GitHub-hosted runners

### 5. Recommended VM Specs

- **For Android builds**: 8+ vCPUs, 32GB RAM (D8as_v5 on Azure)
- **Concurrent builds**: 16 vCPUs, 64GB RAM (D16as_v5)
- **Disk**: 256GB+ SSD

### 6. Monitoring

```bash
# Check runner status
sudo systemctl status 'actions.runner.*.service'

# View logs
journalctl -u actions.runner.Mentra-Community-MentraOS.* -f

# Check disk usage
df -h

# Monitor CPU/RAM
htop
```

### 7. Emergency Fixes

If builds are failing:

1. SSH into runner VM
2. Run cleanup script: `.github/scripts/clean-runner.sh`
3. Restart runner services: `sudo systemctl restart 'actions.runner.*.service'`
4. Check GitHub Actions runner page for connection status
