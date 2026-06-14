# Music Site 音乐发现网站

> **⚠️ 免责声明**
>
> 本项目仅供个人学习和研究使用，**不得用于任何商业用途**。
>
> 本项目所使用的音乐资源来自第三方公开接口，仅用于技术学习和演示目的。所有音乐版权归原作者及版权方所有。如有侵权，请联系删除。
>
> 本项目不提供任何音乐下载服务，不存储任何音乐文件，不承担任何因使用本项目而产生的法律责任。
>
> 使用本项目即表示您已阅读并同意上述声明。**使用风险自负。**

---

## 简介

一个基于 Express + sql.js 的轻量级邀请制音乐发现网站，支持用户注册、收藏、播放队列、真实音乐源搜索/播放、歌词同步、桌面歌词、排行榜等功能。

## 关于本项目

**本项目完全由 AI 编写**，从架构设计、代码实现到调试优化均由 AI（Claude / GPT）完成。

感谢以下资源和支持：

- **[linux.do](https://linux.do) 社区公益站** 提供的 Claude、GPT 模型访问
- **MiMo 百万亿 Token 计划** 提供的算力支持
- **[Claude Code](https://claude.ai/code)** 这个强大的 AI 编程工具
- **[Sensitive-lexicon](https://github.com/konsheng/Sensitive-lexicon)** 提供的敏感词库，用于用户名/昵称过滤

没有这些社区和工具的支持，本项目不可能完成。

## 功能特性

- 🎵 音乐搜索与播放（多接口自动 fallback）
- 📝 歌词同步显示（支持双语翻译歌词）
- 🖥️ 桌面歌词（Document PiP 浮动窗 + 页面内悬浮条）
- 🎨 歌词颜色自定义（预设色块 + 全光谱取色器）
- 📋 单句/整首歌词复制
- ❤️ 收藏歌曲
- 📋 播放队列管理
- 🔄 播放模式切换（顺序 / 单曲循环 / 随机）
- 👤 用户系统（注册、登录、个人中心）
- 🔐 账户安全（修改用户名/密码/邮箱、安全问题找回）
- 🎟️ 邀请制注册（网页后台 + 命令行管理）
- 🔍 敏感词过滤（用户名/昵称）
- ⏱️ 接口限流保护
- 📱 响应式设计，支持移动端
- 🌙 暗色模式
- ⌨️ 键盘快捷键

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 后端 | Node.js + Express |
| 数据库 | sql.js（SQLite in-memory，定时导出到文件） |
| 认证 | JWT + bcrypt |
| 反向代理 | Caddy v2（自动 HTTPS） |
| 前端 | 原生 HTML / CSS / JavaScript（无框架） |
| 部署 | systemd 服务 + systemd timer 备份 |

## 快速开始

### 环境要求

- Node.js >= 18

### 安装

```bash
git clone https://github.com/YOUR_USERNAME/music-site.git
cd music-site
npm install
cp .env.example .env
```

### 配置

编辑 `.env` 文件，至少修改以下项：

```bash
# 生产环境必须改成足够长的随机字符串
JWT_SECRET=your-very-long-random-secret-here

# 设置为 true 时强制要求自定义 JWT_SECRET
PUBLIC_DEPLOY=true

# 你的域名
CORS_ORIGIN=https://your-domain.com
```

### 启动

```bash
npm start
```

默认访问 `http://localhost:3000`

### 语法检查

```bash
npm run check
```

## 环境变量

参考 `.env.example`：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口，默认 `3000` |
| `JWT_SECRET` | JWT 签名密钥，**公网部署必须改成长随机字符串** |
| `CORS_ORIGIN` | 允许跨域的站点，多个域名用英文逗号分隔 |
| `REGISTER_INVITE_CODE` | 种子邀请码，首次启动时导入 |
| `PUBLIC_DEPLOY` | 设为 `true` 时强制要求自定义 `JWT_SECRET` |

> 其他 API 相关变量请参考 `.env.example`，此处不列出具体接口信息。

## 邀请码管理

### 网页后台

使用 `admin` 账号登录后，在"我的音乐"页面进入"邀请码管理"，可以生成、复制、启用或停用邀请码。

### 命令行

```bash
# 查看所有邀请码
npm run invite -- list

# 生成 5 个一次性邀请码
npm run invite -- create 5 1 "备注"

# 生成 1 个不限次数邀请码
npm run invite -- create 1 0 "通用码"
```

## 项目结构

```
music-site/
├── server.js              # Express 入口
├── db.js                  # sql.js 数据库初始化与持久化
├── middleware/
│   └── auth.js            # JWT 认证中间件
├── routes/
│   ├── auth.js            # 用户注册/登录/账户管理
│   └── proxy.js           # 音乐搜索/播放/歌词代理
├── utils/
│   ├── musicResolver.js   # 多源音乐解析与 fallback
│   └── sensitiveWords.js  # 敏感词过滤
├── scripts/
│   ├── invite.js          # 邀请码管理 CLI
│   └── update-sensitive-words.js  # 敏感词库更新
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js         # 页面路由与 UI 逻辑
│       ├── player.js      # 播放器核心
│       ├── api.js         # 前端 API 封装
│       └── icons.js       # SVG 图标
├── .env.example           # 环境变量模板
├── Dockerfile             # Docker 构建文件
└── package.json
```

## 部署建议

### systemd 服务

```ini
# /etc/systemd/system/music-site.service
[Unit]
Description=Music Site
After=network.target

[Service]
Type=simple
User=claude
WorkingDirectory=/path/to/music-site
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/path/to/music-site/.env

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/path/to/music-site

[Install]
WantedBy=multi-user.target
```

### Caddy 反向代理

```
music.your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

## 许可证

本项目采用 [MIT License](LICENSE) 开源。

**再次声明：本项目仅供学习研究，音乐版权归原作者所有。**
