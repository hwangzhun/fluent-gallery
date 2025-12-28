# OSS CORS 配置指南

## 问题说明

当前端直接上传文件到 OSS 时，可能会遇到 CORS（跨域资源共享）错误：

```
Access to XMLHttpRequest at 'http://your-bucket.oss-region.aliyuncs.com/...' 
from origin 'http://localhost:3000' has been blocked by CORS policy
```

## 解决方案

### 方案 1：配置 OSS CORS（推荐）

在阿里云 OSS 控制台配置 CORS 规则，允许前端直接上传。

#### 配置步骤

1. **登录阿里云控制台**
   - 访问：https://oss.console.aliyun.com/
   - 选择你的 Bucket

2. **进入跨域设置**
   - 点击左侧菜单「数据安全」→「跨域设置」
   - 点击「创建规则」

3. **配置 CORS 规则**

   **来源（Allowed Origins）**：
   ```
   http://localhost:3000
   http://localhost:5173
   https://your-domain.com
   ```
   - 开发环境：添加 `http://localhost:3000` 和 `http://localhost:5173`
   - 生产环境：添加你的实际域名（如 `https://your-domain.com`）
   - 可以添加多个来源，每行一个

   **允许 Methods（Allowed Methods）**：
   ```
   GET
   POST
   PUT
   HEAD
   DELETE
   ```

   **允许 Headers（Allowed Headers）**：
   ```
   *
   ```
   或者具体指定：
   ```
   Authorization
   Content-Type
   Content-MD5
   x-oss-*
   ```

   **暴露 Headers（Exposed Headers）**：
   ```
   ETag
   x-oss-request-id
   ```

   **缓存时间（Max Age Seconds）**：
   ```
   3600
   ```

4. **保存规则**

#### 配置示例

```
来源：http://localhost:3000
允许 Methods：GET, POST, PUT, HEAD, DELETE
允许 Headers：*
暴露 Headers：ETag, x-oss-request-id
缓存时间：3600
```

### 方案 2：使用后端代理上传（已自动实现）

如果无法配置 CORS 或配置后仍有问题，系统已自动实现后端代理上传功能。

#### 工作原理

1. **优先尝试前端直传**
   - 前端直接上传到 OSS（速度快，不占用服务器带宽）

2. **自动回退到后端代理**
   - 如果前端直传失败（特别是 CORS 错误）
   - 自动切换到后端代理上传
   - 文件先上传到后端服务器，再由后端上传到 OSS

#### 代码实现

前端代码已自动处理：

```typescript
// services/ossService.ts
export async function uploadToOSSAuto(
  file: File,
  path: string,
  credentials: STSCredentials
): Promise<string> {
  try {
    // 先尝试前端直传
    return await uploadToOSS(file, path, credentials);
  } catch (error: any) {
    // 如果是 CORS 错误，使用后端代理上传
    if (error.message.includes('CORS') || 
        error.message.includes('Access-Control-Allow-Origin') || 
        error.message.includes('XHR error')) {
      console.warn('⚠️  前端直传失败（可能是 CORS 问题），切换到后端代理上传');
      return await uploadToOSSViaProxy(file);
    }
    throw error;
  }
}
```

后端代理上传接口：

```
POST /api/oss/upload
Content-Type: multipart/form-data

file: <文件>
```

## 验证配置

### 测试前端直传

1. 配置 OSS CORS 规则（如上）
2. 重启前端应用
3. 尝试上传文件
4. 检查浏览器控制台，应该没有 CORS 错误

### 测试后端代理

1. 不配置 CORS 或配置错误的 CORS 规则
2. 尝试上传文件
3. 系统会自动回退到后端代理上传
4. 检查服务器日志，应该看到代理上传的日志

## 注意事项

### 1. 开发环境 vs 生产环境

- **开发环境**：需要添加 `http://localhost:3000` 到 CORS 规则
- **生产环境**：需要添加实际域名到 CORS 规则

### 2. 安全性

- CORS 规则中的「来源」应该只包含你信任的域名
- 不要使用 `*` 作为来源（虽然可以，但不安全）

### 3. 性能考虑

- **前端直传**：文件直接上传到 OSS，不经过服务器，速度快
- **后端代理**：文件先到服务器再到 OSS，会占用服务器带宽和资源

### 4. 文件大小限制

- 前端直传：受浏览器和 OSS 限制（通常较大）
- 后端代理：受服务器配置限制（当前设置为 50MB）

## 故障排查

### 问题：仍然出现 CORS 错误

1. **检查 CORS 规则是否正确配置**
   - 确认来源域名完全匹配（包括协议 http/https）
   - 确认允许的 Methods 包含 PUT

2. **清除浏览器缓存**
   - CORS 预检请求可能被缓存
   - 尝试使用无痕模式

3. **检查 OSS 配置**
   - 确认 Bucket 的读写权限正确
   - 确认 AccessKey 有上传权限

### 问题：后端代理上传失败

1. **检查服务器日志**
   - 查看错误信息
   - 确认 OSS 配置正确

2. **检查文件大小**
   - 确认文件不超过 50MB
   - 如需更大文件，修改 `server/routes/oss.ts` 中的限制

3. **检查网络连接**
   - 确认服务器可以访问 OSS
   - 检查防火墙设置

## 相关文件

- `server/routes/oss.ts` - OSS 路由（包含代理上传接口）
- `services/ossService.ts` - OSS 服务（包含自动回退逻辑）
- `components/AdminDashboard.tsx` - 管理后台（使用自动上传功能）

