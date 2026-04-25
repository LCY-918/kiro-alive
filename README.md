<div align="center">

# 🚀 Kiro AWS 批量验活工具

<p align="center">
  <strong>高效、智能、可靠的 AWS 凭据批量验证解决方案</strong>
</p>

<p align="center">
  <a href="#-核心特性">核心特性</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-使用方法">使用方法</a> •
  <a href="#-配置文件格式">配置</a> •
  <a href="#-常见问题">FAQ</a>
</p>
</div>

***

## 📖 项目简介

Kiro-Alive是一个专为批量验证 Kiro AWS 凭据的有效性而设计的 Node.js 命令行工具。通过真实对话测试和智能重试机制，确保每个凭据都经过可靠验证。

### 💡 为什么选择这个工具？

- ⚡ **高效批量处理** - 支持目录模式，一次性处理数百个凭据文件
- 🔄 **智能重试机制** - 自动处理 429 限流、超时等瞬态错误，成功率更高
- 💾 **断点续传** - 测试中断？没关系，继续运行自动跳过已测试的凭据
- 📊 **详细报告** - 生成完整的验活报告，支持 JSON 导出和文件分离
- 🛡️ **稳定可靠** - 指数退避策略 + 抖动算法，避免加剧服务器压力
- 📝 **完整日志** - 所有操作自动记录到文件，方便追踪和调试

## ⚠️ 免责声明

<div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">

**⚠️ 重要提示：本项目仅供学习和研究使用，严禁用于任何非法用途！**

</div>

**使用须知：**

- ✅ 本工具仅用于验证您自己拥有的合法 AWS 凭据
- ✅ 使用本工具时，请遵守 AWS 服务条款和相关法律法规
- ❌ 禁止使用本工具进行未经授权的访问、测试或攻击
- ❌ 禁止使用本工具处理他人的凭据信息
- ⚖️ 使用本工具产生的任何后果由使用者自行承担
- 🚫 作者不对因使用本工具而产生的任何直接或间接损失负责

**请合法、合规、负责任地使用本工具。如果您不同意以上条款，请勿使用本工具。**

***

## ✨ 核心特性

### 🎯 验证功能

- ✅ 批量验证 AWS 凭据的有效性
- ✅ 通过真实对话测试验证账号可用性（不仅仅是认证通过）
- ✅ 支持使用 Kiro API 检查账号状态（更准确的状态检测）
- ✅ 根据 region 字段自动选择正确的 API 端点
- ✅ 记录对话响应内容作为验活证明

### 🔄 智能重试

- 🔁 **智能重试机制**：对 429 限流、408 超时、5xx 服务器错误自动重试（最多 3 次）
- 📈 **指数退避策略**：重试时使用指数退避 + 抖动，避免加剧服务器压力
- ⏱️ 支持自定义请求间隔，防止 API 限流

### 💾 数据管理

- 📂 支持目录模式：自动读取目录下所有 JSON 文件并合并
- 🔖 支持按 email 过滤凭据
- 📊 生成详细的验活报告
- 💾 支持导出 JSON 格式报告
- 📁 支持将正常账号和异常账号分离到不同文件
- 🔄 支持自动从源文件中移除正常账号

### 🛡️ 可靠性保障

- 💾 **断点续传**：测试中断后可继续，自动跳过已测试的凭据
- 📝 自动将所有日志写入文件（logs 目录）
- 🔍 支持详细调试模式（--verbose）
- ⚡ 单个凭据失败不影响其他凭据处理

***

## 🚀 快速开始

### 📋 环境要求

- Node.js >= 18.0.0
- npm 或 yarn 或 pnpm

### 📦 安装依赖

在 `scripts/batch-verify` 目录下执行：

```bash
# 使用 npm
npm install

# 或使用 yarn
yarn install

# 或使用 pnpm
pnpm install
```

### ⚡ 快速运行

**方式 1：使用启动脚本（推荐）**

```bash
# Windows
start.bat

# Linux/macOS
chmod +x start.sh
./start.sh
```

**方式 2：使用 npm**

```bash
npm start
```

**方式 3：直接运行**

```bash
node main.js
```

***

## 📚 使用方法

### 🎮 基本用法

```bash
# 使用默认配置（读取 ./accounts 目录下的所有 JSON 文件）
npm start

# 或直接运行
node main.js
```

### 📂 指定配置文件或目录

```bash
# 指定单个配置文件
node main.js --config /path/to/credentials.json

# 指定配置目录（读取目录下所有 JSON 文件）
node main.js --config /path/to/accounts
```

### ⚙️ 命令行参数

- `--config <path>` - 指定凭据配置文件路径或目录路径（默认：./accounts 目录）
  - 如果是文件：读取该 JSON 文件
  - 如果是目录：读取目录下所有 JSON 文件并合并
- `--interval <seconds>` - 设置请求间隔秒数（默认：2）
- `--emails <email1,email2,...>` - 仅验活指定 email 的凭据
- `--output <path>` - 输出 JSON 报告的文件路径
- `--test-message <message>` - 自定义测试消息（默认："你好"）
- `--timeout <seconds>` - 请求超时时间（默认：30）
- `--verbose` - 输出详细调试信息
- `--check-kiro-api` - 使用 Kiro API 检查账号状态（更准确但更慢）
- `--separate-files` - 将正常账号和异常账号分别保存到不同文件
- `--update-source` - 从源文件中移除正常账号（与 --separate-files 配合使用）
- `--force-retest` - 强制重新测试所有凭据（忽略缓存，清除之前的测试结果）
- `--help` - 显示帮助信息

### 💡 使用示例

```bash
# 使用默认配置（读取 ./accounts 目录）
node main.js

# 指定单个配置文件
node main.js --config /path/to/credentials.json

# 指定配置目录
node main.js --config /path/to/accounts

# 设置请求间隔为 5 秒
node main.js --interval 5

# 仅验活指定 email 的凭据
node main.js --emails user1@example.com,user2@example.com

# 导出 JSON 报告
node main.js --output report.json

# 使用自定义测试消息
node main.js --test-message "Hello"

# 启用详细日志
node main.js --verbose

# 使用 Kiro API 检查账号状态（更准确）
node main.js --check-kiro-api

# 将正常账号和异常账号分别保存
node main.js --separate-files

# 分离账号并从源文件中移除正常账号（仅支持单文件模式）
node main.js --config credentials.json --separate-files --update-source

# 完整示例：读取目录，使用 Kiro API 检查，分离账号
node main.js --config ./accounts --interval 3 --check-kiro-api --separate-files --verbose

# 强制重新测试所有凭据（忽略缓存）
node main.js --force-retest

# 中断后继续测试（自动跳过已测试的凭据）
node main.js
# 如果之前测试中断，再次运行会自动跳过已测试的凭据
```

***

## 📝 配置文件格式

### 单文件模式

凭据配置文件应为 JSON 数组格式，每个凭据对象包含以下字段：

```json
[
  {
    "email": "user@example.com",
    "refreshToken": "your-refresh-token",
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "region": "us-east-1"
  }
]
```

### 目录模式

当使用目录模式时，脚本会：

1. 读取目录下所有 `.json` 文件
2. 合并所有文件中的凭据数组
3. 跳过格式无效的文件（会显示警告但不会中断执行）

目录结构示例：

```
accounts/
├── account-batch-1.json
├── account-batch-2.json
└── account-batch-3.json
```

每个文件都应该是凭据数组格式。

### 字段说明

- `email` - 用户邮箱（可选，用于标识）
- `refreshToken` - AWS refresh token（必需）
- `clientId` - AWS client ID（必需）
- `clientSecret` - AWS client secret（必需）
- `region` - AWS 区域（可选，默认 us-east-1）

***

## 📊 验活报告

脚本执行完成后会输出验活统计信息：

```
验活统计：
总凭据数: 10
成功: 8
失败: 2
跳过: 0

失败凭据详情：
- user1@example.com: refreshToken 无效或已过期
- user2@example.com: 请求超时
```

如果指定了 `--output` 参数，还会生成 JSON 格式的详细报告。

***

## 📁 日志文件

所有日志会自动写入 `logs` 目录：

- `batch-verify.log` - 完整的日志记录（包括所有级别）
- `error.log` - 仅包含错误日志

日志文件特性：

- 自动轮转：单个文件最大 10MB
- 自动压缩：旧日志文件会被压缩
- 保留备份：batch-verify.log 保留 5 个备份，error.log 保留 3 个备份
- 调试日志：即使不使用 `--verbose`，调试信息也会写入日志文件

查看日志：

```bash
# 查看完整日志
cat logs/batch-verify.log

# 查看错误日志
cat logs/error.log

# 实时监控日志
tail -f logs/batch-verify.log
```

***

## 💾 断点续传功能

脚本支持断点续传，测试中断后可以继续执行，自动跳过已测试的凭据。

### 工作原理

- 每个凭据测试完成后，结果会立即保存到缓存文件（`.verify-cache.json`）
- 再次运行脚本时，会自动加载缓存并跳过已测试的凭据
- 使用 email 或 refreshToken 前 20 个字符作为凭据的唯一标识

### 使用场景

**场景 1：测试中断后继续**

```bash
# 第一次运行，测试了 50 个凭据后中断（Ctrl+C）
node main.js

# 再次运行，自动跳过已测试的 50 个凭据，从第 51 个开始
node main.js
```

**场景 2：强制重新测试**

```bash
# 清除缓存，重新测试所有凭据
node main.js --force-retest
```

**场景 3：分批测试**

```bash
# 第一天测试一部分
node main.js --emails user1@example.com,user2@example.com

# 第二天测试另一部分（之前测试的会被跳过）
node main.js --emails user3@example.com,user4@example.com
```

### 缓存管理

缓存文件位置：`.verify-cache.json`

查看缓存内容：

```bash
cat .verify-cache.json
```

手动清除缓存：

```bash
rm .verify-cache.json
# 或使用 --force-retest 参数
node main.js --force-retest
```

### 注意事项

- 缓存基于凭据的 email 或 refreshToken 标识，如果凭据信息变化，会被视为新凭据
- 使用 `--force-retest` 会清除所有缓存并重新测试
- 缓存文件包含测试结果和时间戳，可用于追踪测试历史

***

## ⚠️ 错误处理

脚本会妥善处理以下错误情况：

- 配置文件不存在或格式无效
- 凭据缺少必要字段
- 网络连接失败或超时
- AWS 认证失败
- API 错误响应

单个凭据的验活失败不会影响其他凭据的处理。

***

## ❓ 常见问题

### Q: 为什么请求对话会立即返回被限流（429 错误）？

A: 这是正常现象，有以下几个原因：

**1. API 限流策略**

- Kiro API 和 AWS Q API 都有严格的速率限制
- 即使设置了请求间隔，服务器端可能基于其他因素（如 IP、账号）进行限流
- 使用 `--check-kiro-api` 时，每个凭据会发送多次请求，更容易触发限流

**2. 脚本的处理方式**

- **不用担心**：脚本已内置智能重试机制
- 遇到 429 错误时，会自动使用指数退避策略重试（最多 3 次）
- 重试延迟：200ms → 400ms → 800ms（带随机抖动）
- 大多数情况下，重试 1-2 次后就能成功

**3. 如何减少限流**

```bash
# 增加请求间隔到 3-5 秒
node main.js --interval 5

# 如果使用 Kiro API 检查，脚本会自动在两次请求之间等待 1.5 秒
node main.js --check-kiro-api --interval 5

# 分批处理凭据
node main.js --emails user1@example.com,user2@example.com
```

**4. 实际效果**
即使看到 429 错误日志，只要最终显示 "✓ 验活成功"，说明重试机制已经生效，凭据验活成功。

示例日志：

```
[WARN] 凭据 user@example.com 遇到瞬态错误 (429)，尝试 1/3
[DEBUG] 等待 234ms 后重试...
[WARN] 凭据 user@example.com 遇到瞬态错误 (429)，尝试 2/3
[DEBUG] 等待 456ms 后重试...
[INFO] ✓ 凭据 user@example.com 验活成功
```

### Q: 如何避免被 API 限流？

A: 脚本已内置智能重试机制来处理限流问题：

**自动重试机制**：

- 遇到 429 限流错误时，会自动重试最多 3 次
- 使用指数退避策略：首次重试等待 200ms，之后每次翻倍，最大 2 秒
- 添加随机抖动（最多 25%），避免多个请求同时重试

**手动调整**：

- 使用 `--interval` 参数增加请求间隔，例如 `--interval 5` 设置为 5 秒
- 使用 `--check-kiro-api` 时，脚本会在 Kiro API 检查和对话测试之间自动等待 1.5 秒

**重试策略详情**：

- **瞬态错误**（自动重试）：429 限流、408 超时、5xx 服务器错误
- **非瞬态错误**（不重试）：400 参数错误、401 认证失败、403 权限不足
- **重试延迟**：200ms → 400ms → 800ms（带随机抖动）

示例日志输出：

```
[WARN] 凭据 user@example.com 遇到瞬态错误 (429)，尝试 1/3
[DEBUG] 等待 234ms 后重试...
[INFO] ✓ 凭据 user@example.com 验活成功
```

### Q: 如何只验活部分凭据？

A: 使用 `--emails` 参数指定要验活的 email 列表。

### Q: 验活失败的原因有哪些？

A: 常见原因包括：

- refreshToken 过期或无效
- clientId 或 clientSecret 不正确
- 网络连接问题
- AWS 服务暂时不可用
- 凭据权限不足
- 账号已被封禁

### Q: `--check-kiro-api` 和普通验活有什么区别？

A:

- **普通验活**：只通过对话测试验证凭据是否能正常工作，速度快
- **Kiro API 检查**：额外调用 Kiro Web Portal API 检查账号状态，可以检测到账号封禁、状态异常等问题，更准确但更慢

建议：如果需要精确检测账号状态（如封禁、异常），使用 `--check-kiro-api`；如果只需要快速验证凭据可用性，使用普通模式。

**注意**：使用 `--check-kiro-api` 时，每个凭据会发送两次请求（Kiro API + 对话测试），脚本会在两次请求之间自动等待 1 秒以避免触发限流。

### Q: `--separate-files` 和 `--update-source` 有什么用？

A:

- **--separate-files**：将验活结果分类保存
  - 正常账号保存到 `normal-accounts-{timestamp}.json`
  - 异常账号保存到 `failed-accounts-{timestamp}.json`
- **--update-source**：配合 `--separate-files` 使用，从源文件中移除正常账号，只保留异常账号
  - 适用场景：定期清理正常账号，保持源文件只包含需要处理的异常账号

使用示例：

```bash
# 分离账号但不修改源文件
node main.js --separate-files

# 分离账号并从源文件中移除正常账号
node main.js --separate-files --update-source
```

### Q: 认证时出现 `invalid_client` 错误怎么办？

A: 这通常表示 `clientId` 或 `clientSecret` 不正确。请检查：

1. 凭据配置文件中的 clientId 和 clientSecret 是否正确
2. 这些凭据是否已过期或被撤销
3. 确保使用的是 AWS SSO OIDC 凭据（IdC 类型）

***

## 🛠️ 开发说明

项目采用模块化设计，主要模块包括：

- `main.js` - 主程序入口
- `cli.js` - 命令行参数解析
- `config.js` - 配置文件读取（支持单文件和目录模式）
- `auth.js` - AWS 认证
- `verify.js` - 验活执行
- `kiro-api.js` - Kiro API 调用（账号状态检查）
- `report.js` - 报告生成
- `logger.js` - 日志管理（控制台 + 文件）

### 日志系统

使用 log4js 实现日志管理：

- 控制台输出：彩色日志，支持 verbose 模式
- 文件输出：所有日志自动写入 logs 目录
- 日志轮转：自动管理日志文件大小和备份
- 错误分离：错误日志单独保存到 error.log

***

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

在提交 PR 之前，请确保：

- 代码符合项目的编码规范
- 添加了必要的注释和文档
- 测试通过

***

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

***

## 🙏 致谢

本项目基于以下开源项目开发：

- [hank9999/kiro.rs](https://github.com/hank9999/kiro.rs) - Kiro AWS 代理服务器的 Rust 实现
- [hj01857655/kiro-account-manager](https://github.com/hj01857655/kiro-account-manager) - Kiro 账号管理系统

感谢所有为这些项目做出贡献的开发者！

***

<div align="center">

**⭐ 如果这个项目对你有帮助，请给它一个 Star！**

Made with ❤️ by developers, for developers

</div>
