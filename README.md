# 私有云端求职进度板

一个只供单一账号使用的 Vite + Supabase 求职记录工具。投递记录、面试复盘和状态历史只保存到受 Row Level Security（RLS）保护的 Supabase 项目中；前端不提供注册、分享、团队协作、离线编辑或 JSON 导入。

## 本地运行

需要 Node.js `^20.19.0 || >=22.12.0`（与 Vite 7 的要求一致）。

```bash
npm ci
cp .env.example .env.local
npm test
npm run dev
```

在 `.env.local` 中仅填写以下两个公开客户端变量：

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase public anon key>
```

不要提交 `.env.local`。运行生产构建使用：

```bash
npm run build
```

## 首次配置 Supabase

1. 在 Supabase Dashboard 创建一个新项目，并等待项目状态变为可用。
2. 在 **SQL Editor** 新建查询，将 [`supabase/migrations/202609020001_init.sql`](supabase/migrations/202609020001_init.sql) 的全部内容粘贴并执行。这会创建三张业务表、触发器和 RLS 策略。
3. **先创建唯一用户，再关闭公开注册：**打开 **Authentication → Users → Add user → Create new user**，以将用于登录的邮箱创建一个用户。将其确认/激活（如界面提供该选项），并用密码管理器生成并保存任意强密码；应用只使用邮箱六位验证码，不需要在应用中输入这个密码。确认 Users 列表中只有这个预期账号。
4. 仅在该用户已存在后，打开 **Authentication → Configuration → General**，关闭 **Allow new users to sign up**。同时保持 **Allow anonymous sign-ins** 关闭。前端也会以 `shouldCreateUser: false` 请求验证码，双重避免网页创建账号。
5. 打开 **Authentication → Email Templates**，编辑用于邮箱登录的模板，使它包含六位码变量 `{{ .Token }}`。可使用：

   ```html
   <h2>登录验证码</h2>
   <p>请输入此六位验证码：{{ .Token }}</p>
   ```

   不要在该模板中只保留 `{{ .ConfirmationURL }}`，否则会发送魔法链接而不是本应用要求的六位 OTP。
6. 在 **Project Settings → API** 复制项目 URL 和 public anon key，填入本地 `.env.local` 或下一节的 Vercel 环境变量。

Supabase 的邮箱 OTP 在模板包含 `{{ .Token }}` 时发送六位验证码；`shouldCreateUser: false` 会阻止未知邮箱自动注册。详情见 [Supabase 的密码无关邮箱登录文档](https://supabase.com/docs/guides/auth/auth-email-passwordless) 和 [认证配置说明](https://supabase.com/docs/guides/auth/general-configuration)。

## 部署到 Vercel

导入此 Git 仓库作为 Vercel 项目。构建命令为 `npm run build`，输出目录为 `dist`。在 Vercel 项目的 **Settings → Environment Variables** 中为所需环境（至少 Production）设置且只设置：

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase public anon key>
```

`vercel.json` 提供 SPA 回退到 `/index.html`，并为响应添加 `nosniff`、`no-referrer` 和限制浏览器功能的 `Permissions-Policy`。

公开 anon key 可以放在浏览器：它只能以当前会话身份调用 RLS 明确允许的操作，不能绕过表的按用户策略。绝不把 Supabase `service_role` 密钥放进 `.env.local`、`VITE_` 变量、Vercel 环境变量、源代码、构建产物或浏览器；该管理密钥会绕过 RLS，必须只保存在受信任的服务器端（本项目不需要它）。

## RLS 安全检查

在终端设置项目 URL 和 public anon key 后，执行未携带 `Authorization: Bearer <user JWT>` 的查询：

```bash
curl -i "https://<project-ref>.supabase.co/rest/v1/applications?select=id" \
  -H "apikey: <Supabase public anon key>"
```

预期响应主体为 `[]`（即使表中已有该用户的数据，也不返回任何行）。这说明未认证请求无法通过 `auth.uid() = user_id` 的 SELECT 策略读取数据。用浏览器登录后再进行一次正常读取，确认该账号只能看到自己的记录。生产前还应在 Supabase Dashboard 的 Table Editor / API 日志中确认三张表都启用了 RLS。

## 云端备份与恢复边界

登录后，点击页面顶部的 **导出备份**。应用会先从云端重新读取投递、面试和状态历史，再立即下载 `求职进度云端备份-YYYY-MM-DD.json`。JSON 包含 `version`、`exportedAt`、`applications`、`interviews` 和 `statusHistory`，请将文件保存到你自己的加密备份位置。

本版本故意**不提供 JSON 导入**，也不会从旧 `localStorage` 自动迁移；这样避免错误文件覆盖已确认的云端数据。备份文件可用于留存和人工核对，但要恢复到数据库时请先在隔离项目中验证，并使用受控的服务器端迁移流程，不要把管理密钥交给浏览器。

## 删除与退出

- 删除一条投递前，界面会二次确认；关联的面试记录和状态历史会级联删除且无法恢复。请先导出备份。
- 要删除 Vercel 部署：在 Vercel 项目中打开 **Settings → Advanced → Delete Project**，确认项目名称。此操作会移除该项目的部署和其 Vercel 环境变量。
- 要删除 Supabase 数据和项目：先导出备份，然后在 Supabase 项目中打开 **Settings → General → Delete project**，按界面要求确认项目引用名。删除项目会永久删除认证用户、数据库和备份以外的所有云端数据。

删除完成后，在本地和 Vercel 中删除不再需要的 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 配置。
