using System;
using System.IO;
using System.Net;
using System.Text;
using System.Linq;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading;
using System.Web.Script.Serialization;

namespace CodexWebTray {
    // OpenCode owns this shared daemon; monitoring and tray exit never stop it.
    internal sealed class OpenCodeService {
        internal const string Url = "http://127.0.0.1:45278/";
        internal static string ConfigPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "opencode", "service.json");
        internal Lamp State = Lamp.Waiting;
        internal string Detail = "正在检查 OpenCode";
        internal static Func<string[],string> TestCommand = null;
        internal static Func<string,int> TestProbe = null;
        internal static string Password() {
            if (!File.Exists(ConfigPath)) return null;
            var config = new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(ConfigPath));
            object value;
            return config != null && config.TryGetValue("password", out value) ? value as string : null;
        }
        internal static int Probe(string password) {
            if (TestProbe != null) return TestProbe(password);
            var req = (HttpWebRequest)WebRequest.Create(Url + "api/info");
            req.Proxy = null; req.Timeout = 1800; req.ReadWriteTimeout = 1800; req.AllowAutoRedirect = false;
            if (!String.IsNullOrEmpty(password)) req.Headers["Authorization"] = "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes("opencode:" + password));
            try {
                using(var response = (HttpWebResponse)req.GetResponse()) using(var reader = new StreamReader(response.GetResponseStream())) {
                    var info = new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
                    object version;
                    return info != null && info.TryGetValue("version", out version) && version is string && info.ContainsKey("capabilities") ? 200 : 502;
                }
            } catch(WebException ex) {
                var response = ex.Response as HttpWebResponse;
                if (response != null) { int status = (int)response.StatusCode; response.Close(); return status; }
                return ex.Status == WebExceptionStatus.ConnectFailure ? 0 : 503;
            } catch(ArgumentException) { return 502; }
        }
        internal void Refresh() {
            try {
                int status = Probe(Password());
                State = status == 200 ? Lamp.Healthy : status == 0 ? Lamp.Paused : Lamp.Error;
                Detail = status == 200 ? "服务器已连接 · 每 3 秒自动检测" : status == 0 ? "共享后台服务未启动" : status == 401 ? "服务器认证失败，请检查 OpenCode 密码" : "服务器未就绪（" + status + "）";
            } catch { State = Lamp.Error; Detail = "无法读取 OpenCode 服务配置，请检查文件和权限"; }
        }
        internal static string FindCommand() {
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ai.opencode.desktop", "cli");
            if (Directory.Exists(root)) {
                string command = Directory.GetDirectories(root).Select(x => Path.Combine(x, "opencode-cli.exe")).Where(File.Exists).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
                if (command != null) return command;
            }
            throw new IOException("未找到 OpenCode 桌面版 CLI，请先安装或打开 OpenCode。");
        }
        internal static string QuoteArgument(string value) {
            // Windows CRT quoting, including embedded quotes and trailing backslashes.
            var result = new StringBuilder("\""); int slashes = 0;
            foreach(char c in value) {
                if (c == '\\') { slashes++; continue; }
                result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes); result.Append(c); slashes = 0;
            }
            return result.Append('\\', slashes * 2).Append('"').ToString();
        }
        internal static string Command(params string[] args) {
            if (TestCommand != null) return TestCommand(args);
            var start = new ProcessStartInfo(FindCommand(), String.Join(" ", args.Select(QuoteArgument))) {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
            };
            using(var process = Process.Start(start)) {
                var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(20000)) { try { process.Kill(); } catch(InvalidOperationException) {} throw new IOException("OpenCode 命令超时，请检查服务状态后再试。"); }
                output.Wait(); error.Wait();
                // CLI output can contain the server password. Never copy it to logs or errors.
                if (process.ExitCode != 0) throw new IOException("OpenCode 命令未完成，请查看 OpenCode 服务状态。");
                return output.Result;
            }
        }
        internal static void WaitReady(string password) {
            for(int i = 0; i < 15; i++) { if (Probe(password) == 200) return; Thread.Sleep(300); }
            throw new IOException("OpenCode 尚未恢复，请检查服务状态；不要重复修改密码。");
        }
        internal void Control(string action) {
            if (!new[]{"start", "stop", "restart"}.Contains(action)) throw new ArgumentException("未知的 OpenCode 服务操作。");
            Command("service", action);
            if (action != "stop") WaitReady(Password());
            Refresh();
        }
        internal static void ValidatePassword(string value) {
            if (String.IsNullOrWhiteSpace(value) || value.Length < 8 || value.Length > 128 || value.Any(Char.IsControl)) throw new ArgumentException("OpenCode 密码需为 8–128 个字符，不能包含控制字符。");
        }
        internal void ChangePassword(string password) {
            ValidatePassword(password);
            string previous = Password();
            Command("service", "set", "password", password);
            Command("service", "start"); WaitReady(password);
            if (!String.IsNullOrEmpty(previous) && previous != password && Probe(previous) != 401) throw new IOException("新密码已保存，但旧密码失效检查未通过，请检查服务器认证配置。");
            Refresh();
        }
    }
}
