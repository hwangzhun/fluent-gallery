# Fluent Gallery

一个面向摄影作品展示的全栈画廊应用，包含响应式瀑布流、照片筛选与详情、点赞和浏览统计，以及带登录保护的管理后台。

## 功能

- 响应式摄影画廊、灯箱预览、年份与标签筛选
- 照片上传、批量编辑、EXIF 读取和缩略图处理
- 点赞、浏览量与展示设置
- 管理后台、会话登录和密码修改
- SQLite 数据库
- 本地文件、阿里云 OSS 或腾讯云 COS 存储

## 技术栈

- React 19、TypeScript、Vite 6、Tailwind CSS 4
- Express、SQLite、Sharp
- Vitest、Testing Library、Supertest

## 本地运行

前置要求：Node.js 20.6+ 和 npm。

```bash
git clone https://github.com/hwangzhun/fluent-gallery.git
cd fluent-gallery
npm install
cp .env.example .env
npm run dev
```

启动后访问：

- 图库：<http://localhost:3000>
- 管理后台：<http://localhost:3000/#/admin>
- API 健康检查：<http://localhost:3001/health>

首次运行的管理员密码是 `admin123`。登录后请立即在“设置 → 安全”中修改。

## 环境变量

将 [`.env.example`](.env.example) 复制为 `.env` 后按需修改。常用配置如下：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `3001` | API 服务端口 |
| `CORS_ORIGIN` | `http://localhost:3000` | 本地开发的跨域前端来源；Docker 同源部署无需配置 |
| `GALLERY_DB_PATH` | `./data/gallery.db` | SQLite 数据库路径 |
| `HOST_PORT` | `3000` | Docker 仅在宿主机回环地址暴露的端口 |
| `LOCAL_UPLOAD_DIR` | `./uploads` | 本地照片存储目录 |
| `LOCAL_PUBLIC_URL` | `http://localhost:3001/uploads` | 本地开发的照片公开地址；Docker 默认使用同源 `/uploads` |
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | 前端 API 地址；Docker 构建时固定为同源 `/api` |

存储服务统一在管理后台“设置 → 存储”中配置，包括本地目录、公开地址、对象存储密钥和腾讯云图片处理。AI 接口地址、模型和密钥在“设置 → API 设置”中配置。这些设置保存在数据库中，无需填写到 `.env`。首次未配置存储时默认使用本地存储。

## 常用命令

```bash
npm run dev          # 同时启动前端与 API 服务
npm run dev:client   # 仅启动前端
npm run dev:server   # 仅启动 API 服务
npm run dev:full     # npm run dev 的兼容别名
npm test             # 运行测试
npm run build        # 构建前端
npm run preview      # 预览前端构建结果
```

## 项目结构

```text
components/          React 组件与管理后台
database/            数据库初始化、迁移与 DAO
public/              前端静态资源
server/              Express API、鉴权和存储适配
api/            前端 API 服务
data/                本地 SQLite 数据（不会提交）
uploads/             本地上传文件（不会提交）
```

数据库设计见 [`database/README.md`](database/README.md)，API 概览见 [`server/README.md`](server/README.md)。

## Docker 部署

生产镜像将 Vite 前端和 Express API 放在同一容器内，浏览器统一通过同一域名访问页面、`/api`、`/uploads` 和 `/health`。

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/health
```

Docker 部署不需要 `.env` 或任何存储配置。Compose 只监听 `127.0.0.1:${HOST_PORT:-3000}`，不直接向公网暴露。首次启动会在 `data/gallery.db` 自动创建空数据库，并默认使用宿主机 `uploads` 目录保存照片。入口点会修复绑定挂载的运行目录权限，再以非 root 用户运行服务。已有本地图库首次以 Docker 启动时，会自动将旧的 `localhost:3001/uploads` 照片地址迁移为当前公开地址。`data`、`uploads` 和 `logs` 都持久化在宿主机，重建镜像不会删除它们。SQLite 只允许运行一个 `gallery` 容器副本，不要横向扩容。

Nginx 反向代理示例：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 64m;
}
```

应用默认使用本地照片存储，路径为 `/app/uploads`，公开地址为同源 `/uploads`。生产环境使用 `Secure` 管理员 Cookie，因此对外域名必须启用 HTTPS。

### 备份与恢复

为保证 SQLite 备份一致，复制数据前先停止容器：

```bash
docker compose stop gallery
mkdir -p backups
cp data/gallery.db backups/gallery-$(date +%Y%m%d-%H%M%S).db
docker compose start gallery
```

恢复时先停止容器，将选定的备份复制为 `data/gallery.db`，再启动容器。如果使用本地照片存储，备份时还应同时备份 `uploads/`。`.env`、数据库、照片和日志均被 `.dockerignore` 排除，不会进入镜像层。

### 画册

前台标题栏“画册”进入 `/#/albums`，以照片堆叠卡片展示已发布的非空画册，点击后按册内顺序打开大图。画册顺序不受首页随机展示设置影响。

后台“画册管理”支持草稿、发布、简介、选片、封面及顺序编排。照片可以加入多个画册；删除画册仅解除关联。照片管理可按画册筛选、批量加入画册，并在编辑或上传时选择所属画册。上传的“画册”公共开关遵循现有公共字段规则：打开后再次修改选择，才会同步当前批次。

数据库启动时自动增量创建 `albums`、`album_photos` 及索引，已有照片和统计不会重建。发布状态只控制画册可见性，画册中的照片仍属于公开作品集。
