# Windows sandbox / Windows 沙箱

## 中文

此主机的旧 elevated 沙箱初始化发生权限及运行文件共享占用错误。经读写范围、命令和网络限制验证，当前用户的 `%USERPROFILE%\.codex\config.toml` 中使用：

```toml
[windows]
sandbox = "mxc"
```

这是一项 **Codex 主机配置**，不是关闭沙箱。网页服务仍使用 `workspace-write` 和 `on-request`，不会自动改为无限权限或绕过审批。

1.4.3.6 的 EXE 保留现有主机配置；换回此版本不会重置 MXC、密码或 Access Token。发行包不包含个人 config.toml。新主机需要先确认当前 Codex Windows 版本支持 MXC，备份原配置，修改已有 `[windows]` 节中的 `sandbox`（不要重复添加同名节），然后在没有执行任务时重开 Codex 和托盘，验证实际命令、文件访问和网络限制。

不能对所有 Windows/Codex 版本无条件套用此选项，也不要删除锁、强制结束运行中的工具或设置 `danger-full-access` 来掩盖初始化失败。可参考 [OpenAI Windows 沙箱说明](https://learn.chatgpt.com/docs/windows/windows-sandbox)。

## English

The repaired host uses `sandbox = "mxc"` in the existing `[windows]` section of its user Codex configuration. This is a host configuration, not a sandbox bypass. The web service retains `workspace-write` and `on-request`.

The EXE preserves existing configuration; personal `config.toml` is not distributed. On another host, verify compatibility with the installed Windows Codex version, back up the file, update the existing section rather than duplicating it, and restart only after tasks finish. Validate commands, file boundaries and network restrictions. Do not assume every Windows/Codex version supports the same backend.
