using System;

namespace CodexWebTray {
    internal enum Lamp { Waiting, Healthy, Error, Paused }
    internal interface IServiceRuntime {
        bool DesktopRunning();
        bool ServiceRunning { get; }
        void Start();
        void Stop();
        bool Healthy();
    }
    internal sealed class Monitor {
        internal Lamp State = Lamp.Waiting;
        internal string Detail = "等待 Codex 桌面程序启动";
        internal volatile bool Enabled = true;
        internal bool Desktop;
        internal DateTime RetryAt = DateTime.MinValue;
        internal int Failures;
        readonly IServiceRuntime runtime;
        internal Monitor(IServiceRuntime runtime) { this.runtime = runtime; }
        internal void Tick(DateTime now) {
            try {
                Desktop = runtime.DesktopRunning();
                if (!Enabled || !Desktop) {
                    runtime.Stop(); Failures = 0; RetryAt = DateTime.MinValue;
                    State = Enabled ? Lamp.Waiting : Lamp.Paused;
                    Detail = Enabled ? "等待 Codex 桌面程序启动" : "已手动关闭，自动启动已暂停";
                    return;
                }
                if (!runtime.ServiceRunning) {
                    if (now < RetryAt) { State = Lamp.Error; return; }
                    runtime.Start();
                }
                if (runtime.Healthy()) {
                    State = Lamp.Healthy; Detail = "Codex 已运行，网页服务正常";
                    Failures = 0; RetryAt = DateTime.MinValue;
                } else {
                    State = Lamp.Error; Detail = "Codex 已运行，网页服务未就绪，正在检查";
                    if (++Failures >= 5) {
                        runtime.Stop(); Failures = 0;
                        RetryAt = now.AddSeconds(30);
                        Detail = "网页服务连续未响应，30 秒后自动重试";
                    }
                }
            } catch (Exception ex) {
                State = Lamp.Error;
                Detail = "服务异常：" + ex.Message;
                RetryAt = now.AddSeconds(30);
            }
        }
        internal void Retry() { RetryAt = DateTime.MinValue; Failures = 0; }
    }
    internal static class DesktopIdentity {
        internal static bool Matches(string name, string path) {
            if (String.IsNullOrEmpty(path)) return false;
            path = path.Replace('/', '\\').ToLowerInvariant();
            name = name.ToLowerInvariant();
            if (name != "chatgpt" && name != "codex") return false;
            // CLI app-server instances must never satisfy the desktop gate.
            if (path.Contains("\\bin\\") || path.Contains("\\node_modules\\") || path.Contains("\\resources\\")) return false;
            return (path.Contains("\\windowsapps\\openai.codex_") && path.EndsWith("\\app\\" + name + ".exe"))
                || path.EndsWith("\\programs\\codex\\codex.exe")
                || path.EndsWith("\\programs\\codex\\chatgpt.exe")
                || (path.Contains("\\openai\\codex\\app-") && path.EndsWith("\\" + name + ".exe"));
        }
    }
}
