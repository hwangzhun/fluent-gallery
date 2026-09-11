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
| `CORS_ORIGIN` | `http://localhost:3000` | 允许访问 API 的前端来源，多个值用逗号分隔 |
| `GALLERY_DB_PATH` | `./data/gallery.db` | SQLite 数据库路径 |
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | 前端请求的 API 地址 |
| `STORAGE_MODE` | `local` | `local` 或 `oss` |
| `LOCAL_UPLOAD_DIR` | `./uploads` | 本地上传目录 |
| `LOCAL_PUBLIC_URL` | `http://localhost:3001/uploads` | 本地图片公开地址 |

对象存储所需的 `OSS_*` 变量及示例请查看 [`.env.example`](.env.example)。`OSS_UPLOAD_DIR` 默认是 `fluent_gallery`，照片与缩略图会统一存放在该目录下。腾讯云可通过 `OSS_CLOUD_IMAGE_PROCESSING=true` 启用数据万象的单请求 AVIF 处理，`OSS_PUBLIC_URL` 可配置已绑定的 HTTPS 图片域名。也可以登录管理后台后配置存储服务。

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
services/            前端 API 服务
data/                本地 SQLite 数据（不会提交）
uploads/             本地上传文件（不会提交）
```

数据库设计见 [`database/README.md`](database/README.md)，API 概览见 [`server/README.md`](server/README.md)。

## 部署提示

`npm run build` 只生成前端静态文件；生产环境还需要单独运行 API 服务，并将 `VITE_API_BASE_URL` 与 `CORS_ORIGIN` 配置为实际域名。`.env`、数据库和上传文件已被 Git 忽略，请通过部署平台的密钥管理和持久化存储单独配置。

### 画册

前台标题栏“画册”进入 `/#/albums`，以照片堆叠卡片展示已发布的非空画册，点击后按册内顺序打开大图。画册顺序不受首页随机展示设置影响。

后台“画册管理”支持草稿、发布、简介、选片、封面及顺序编排。照片可以加入多个画册；删除画册仅解除关联。照片管理可按画册筛选、批量加入画册，并在编辑或上传时选择所属画册。上传的“画册”公共开关遵循现有公共字段规则：打开后再次修改选择，才会同步当前批次。

数据库启动时自动增量创建 `albums`、`album_photos` 及索引，已有照片和统计不会重建。发布状态只控制画册可见性，画册中的照片仍属于公开作品集。
