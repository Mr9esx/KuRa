# CI/CD 与服务器部署说明（release 分支）

## 1. GitHub Secrets 配置

仓库 `Settings -> Secrets and variables -> Actions` 新增：

- `DEPLOY_HOST`: `118.196.126.221`
- `DEPLOY_USER`: `root`
- `DEPLOY_KEY`: SSH 私钥内容（见下方生成方式）

### 生成 SSH 密钥对

```bash
# 本地生成密钥对（无需设置密码短语）
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key

# 将公钥添加到服务器
ssh-copy-id -i ~/.ssh/deploy_key.pub root@118.196.126.221

# 查看私钥内容，复制到 GitHub Secret DEPLOY_KEY 中
cat ~/.ssh/deploy_key
```

> 注意：复制私钥时需要包含 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----` 这两行。

## 2. 自动流程

已配置工作流文件：`.github/workflows/release-deploy.yml`

触发条件：

- 向 `release` 分支 push 代码时自动触发

执行步骤：

1. 安装依赖并构建前端（`npm ci && npm run build`）
2. 打包 `dist` 为 `release.tar.gz`
3. 上传到服务器 `/tmp`
4. 在服务器上解压到 `/var/www/miaoplus.com/dist`
5. 自动安装/配置 Nginx 并重载

## 3. 服务器目标结构

- 网站目录：`/var/www/miaoplus.com/dist`
- Nginx 配置：`/etc/nginx/conf.d/miaoplus.com.conf`
- 站点域名：`miaoplus.com`、`kura.miaoplus.com`

## 4. 手动兜底部署（可选）

仓库包含脚本：`deploy/server-deploy.sh`

当你手动上传了构建包后，可在服务器执行：

```bash
bash deploy/server-deploy.sh /tmp/release.tar.gz
```

Nginx 配置模板见：`deploy/nginx/miaoplus.com.conf`

## 5. 首次上线建议

1. 本地先确认构建通过：`npm run build`
2. 提交并 push 到 `release`
3. 在 GitHub Actions 查看 `Release Deploy` 运行结果
4. 浏览器访问 `https://kura.miaoplus.com` 验证

> 说明：当前配置是 HTTP（80端口）。如需 HTTPS，可继续接入 certbot 并自动续期。
