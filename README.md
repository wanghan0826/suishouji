# 随手记 · 让心情飘过，让故事相遇

一个可以自行部署的满屏弹幕分享站。每条弹幕都是帖子的入口，支持文字、图片、视频、评论、点赞、签到和每日话题。提供四种视觉主题、可选自动变化，以及帖子、评论和每日话题管理端。

弹幕保留全屏布局，电脑最多4行、手机最多3行；间距更宽，初始可见数量随帖子数量调整，少量帖子不会被重复铺满屏幕。

前端原生 HTML / CSS / JavaScript，后端 Node.js 内置 SQLite，无 npm 运行依赖。源码包含前后端；**GitHub Pages 不能运行本项目后端**。

## 普通用户注册与账号管理

首页顶部“登录 / 注册”提供用户名和密码注册。用户名为3至20位字母、数字或下划线（不区分大小写），新密码为6至12位（已有较长密码仍可登录）；不需要邮箱、短信或额外发信服务。注册前会说明内容归属和必要的账号记录。

未登录可以看弹幕、帖子、图片和评论，发布、评论、点赞和签到需要登录。新发布的帖子和评论在服务器关联固定账号 ID，忽略客户端自行填写的昵称。用户可以在账号窗口退出登录或修改密码；修改密码会注销其他会话。不绑定邮箱，因此没有邮箱找回功能，请保存好密码。

站主管理端新增“账号管理”：搜索账号、查看关联帖子及评论、查看注册 IP 和近30天登录记录、封禁或解除封禁。封禁会立即注销全部会话，并阻止该账号登录和发布；已有内容可另行移入回收站。旧匿名帖子不会追认给新账号。

账号和 IP 记录不能证明真实身份，也不能阻止用户用另一个账号重新注册。密码使用加盐 scrypt 派生后保存；会话保存在 HttpOnly Cookie，公网必须 HTTPS。用户隐私记录只向已登录的站主管理端提供，公开帖子接口不会返回这些记录。登录事件只保留近30天，注册 IP 随账号记录保存。

## 本仓库共同维护现有阿里云网站

本仓库的 `main` 分支配置了自动部署到现有的 `https://suishouji.online/`：推送后 GitHub Actions 自动测试、上传版本并切换服务，无需站主点击批准。首次部署通道安装完成后启用。

协作者接受仓库邀请后，可以直接推送到 `main` 触发部署；日常修改也可以通过分支和 Pull Request 协作，合并到 `main` 后自动上线。这里的部署目标就是同一个在线站点，部署成功后访客可以看到新版本。

在仓库 **Actions → Test and deploy to Aliyun** 查看结果。GitHub 和服务器各执行一次测试；测试失败不会切换现有服务，切换后健康检查失败会回退上一代码版本。代码版本记录在 `/__deployment.json`。应用继续使用服务器已有的 `/opt/wall/data`，不会用仓库覆盖数据库、管理账户或上传图片；代码回退不回退数据库。

部署账户仅允许接收发布包，并有重启 `wall.service` 的权限，不提供 SSH 交互式终端。Actions 的 SSH 私钥保存在仓库加密 Secrets 中，不写进源码。安装接收程序 `deploy/receive.py` 的服务器维护者需要单独更新它，它不会随普通代码部署自动替换。

下方 Docker 部署章节供想独立搭站的人使用，现有阿里云站点继续使用原来的 systemd 服务和 Nginx。

## 在自己的服务器部署

准备一台 Linux 服务器、一个指向该服务器的域名，以及 Docker Engine 和 Compose 插件。放行 TCP 80/443（可选 UDP 443），这两个端口应未被其他 Web 服务占用。

```sh
git clone https://github.com/wanghan0826/suishouji.git suishouji
cd suishouji
cp .env.example .env
```

编辑 `.env`，将 `SITE_DOMAIN=wall.example.com` 换成自己的域名，不带 `https://` 或结尾斜杠。

```sh
docker compose up -d --build
docker compose exec app node admin-setup.mjs
```

第二条命令会交互式设置管理用户名和密码（至少 12 位，输入不回显）。没有默认密码，不能通过网页抢注管理员。完成后访问：

- 网站：`https://你的域名/`
- 管理端：`https://你的域名/admin`

Caddy 负责 HTTPS 证书和反向代理。首次签发证书需要域名解析正确、80/443 端口可达；证书签发受证书服务商政策约束。Compose 内的应用没有向宿主机公开 8080 端口。

### 可选：加入示例图文

新部署默认是空站，不会复制原网站的用户内容。启动后可以添加四条明确标注为“站点示例”的图文，让弹幕墙马上有内容：

```sh
docker compose exec app node scripts/seed-demo.mjs
```

只允许在没有帖子的空站执行，避免反复插入。也可以直接通过首页发布自己的内容。配图来源见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 本地运行

安装 Node.js 24 或以上（需要内置 `node:sqlite`）。不需要执行 `npm install`。

```sh
node server.mjs
```

打开 `http://localhost:8080`。要使用本地管理端，在另一个终端执行 `node admin-setup.mjs`。本地 HTTP 模式仅监听 `127.0.0.1`，不能拿此模式直接公开到网络。

运行自动化测试：

```sh
node --test tests/*.test.mjs
```

## 已有 Nginx 等反向代理时

无需使用 Compose 中的 Caddy。可以安装 Node.js 24+，由自己的进程管理服务运行 `server.mjs`，设置：

```sh
SITE_ORIGIN=https://wall.example.com HOST=127.0.0.1 PORT=8080 TRUST_PROXY=1 TZ=Asia/Shanghai node server.mjs
```

Nginx 在 HTTPS 站点中反向代理到 `http://127.0.0.1:8080`，设置 `client_max_body_size 65m`、`proxy_set_header Host $host`、`proxy_set_header X-Forwarded-Proto $scheme` 和 `proxy_set_header X-Forwarded-For $remote_addr`。HTTP 入口跳转 HTTPS。管理端通过来源校验保护写操作，`SITE_ORIGIN` 必须与浏览器访问地址一致。

`TRUST_PROXY=1` 只应在应用仅能被可信代理访问时设置。标准 Compose 配置已用内部网络隔离应用。不要把应用 8080 端口直接映射到公网。

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `SITE_ORIGIN` | `http://localhost:8080` | 完整站点来源，不带路径或结尾斜杠；公网必须为 HTTPS |
| `PORT` | `8080` | 应用监听端口 |
| `HOST` | `127.0.0.1` | HTTPS 部署的绑定地址；Docker 内设为 `0.0.0.0` |
| `DATA_DIR` | 项目目录的 `data/` | SQLite、管理账户和用户上传的保存位置 |
| `TRUST_PROXY` | 关闭 | `1` 表示信任代理传来的协议和客户端地址 |
| `TZ` | 由运行环境决定 | 建议 `Asia/Shanghai`，Compose 中已设置 |

## 更新、备份与恢复

更新前先备份，再更新代码并重建：

```sh
git pull --ff-only
docker compose up -d --build
```

站点数据保存在 `wall_data` 命名卷，证书保存在 `caddy_data`。普通重建不会清空数据；**不要执行 `docker compose down -v`，它会删除数据卷**。

为了让数据库和上传文件保持一致，可短暂停止写入后备份：

```sh
docker compose stop app
docker compose run --rm --no-deps --user root --entrypoint tar app -C /app/data -czf - . > wall-data-backup.tar.gz
docker compose start app
```

备份包含用户内容和管理账户派生值，应私下保管。恢复时在目标站停机状态下，将可信备份解压到数据卷，保证文件归容器的 `node` 用户（UID/GID 1000:1000）所有，再启动。不要把正在使用的数据直接覆盖为旧备份。

排查启动：`docker compose ps`、`docker compose logs --tail=100 app caddy`。证书失败先查 DNS 和 80/443 端口；登录来源错误先查 `.env` 域名和反向代理的协议头。

## 目录与内容修改

```text
public/                首页、弹幕、视觉主题、图文与管理界面
server.mjs             HTTP API、SQLite、媒体上传和静态文件服务
admin-service.mjs      管理登录、回收站、每日话题和操作记录
admin-setup.mjs        站主交互式设置或重置账户
deploy/Caddyfile       HTTPS 反向代理
scripts/seed-demo.mjs  可选空站示例内容
tests/                 隔离数据库的管理接口测试
```

编辑 `public/editorial.json` 可替换四篇精选文章，`public/assets/` 保存配图。每天的话题可在管理端安排；视觉主题由每位访客自行选择，保存在该访客浏览器中。

`scripts/archive-legacy-demos.mjs` 是针对原始20条示例的可选维护命令，平时不会自动运行。默认仅预览，`--apply` 才会移入回收站。使用 `--account 用户名 --repost-featured` 可在站主授权下把原有8篇精选图文整理到指定账号，保留来源，并标注为网络配图；重复执行不会再次发布。执行前应备份数据库。命令校验示例原文和归属，发现已被修改的内容会停止，不会处理新的用户帖子。

仓库不包含原站数据库、用户上传、管理账户、会话、服务器私钥或阿里云配置。自行部署的站点互相独立，不会连接原站数据库。

部署基础参考：[Docker Compose 官方文档](https://docs.docker.com/compose/gettingstarted/)、[Caddy 反向代理及 HTTPS 文档](https://caddyserver.com/docs/quick-starts/reverse-proxy)。
