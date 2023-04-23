<div align="center">
<h1>koishi-plugin-verify</h1>
<p>群聊发言认证</p>
</div>

[![npm](https://img.shields.io/npm/v/koishi-plugin-verify?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-verify)

## 安装

### 1. 设置 Bot 为管理员

将 Bot 账号设置为群聊管理员。

### 2. 启用插件

在插件市场中搜索 verify 即可下载安装；安装后可直接启用。

### 3. 配置自助解禁

配置独立的前后端，提示用户输入 QQ 号解禁，使用 GET 请求将 QQ 号直接附在 `http://机器人IP:端口/unban?qq=` 后即可实现解禁。

### 4. 取消管理员验证（可选）

将入群门槛改为「无需验证」。

## 使用

1. Bot 会自动禁言每个进群的群友，然后发送提示；
1. 使用 `clean` 指令查看超过期限还未解禁的群友，`clean -y` 踢出。默认期限为 3 天，可以在配置项中修改。

## 许可

[MIT](https://github.com/ilharp/koishi-plugin-verify/blob/master/LICENSE)
