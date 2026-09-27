using System;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using Microsoft.Win32;

namespace CodexWebTray {
    internal static class Paths {
        internal static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexWebTray");
        internal static readonly string Logs = Path.Combine(Root, "logs");
        internal const string Url = "http://127.0.0.1:18923/";
        internal static string Payload;
        static readonly object LogLock = new object();
        internal static void Log(string message, bool backend = false) {
            try { lock (LogLock) {
                Directory.CreateDirectory(Logs);
                string p = Path.Combine(Logs, backend ? "service.log" : "tray.log");
                if (File.Exists(p) && new FileInfo(p).Length > 2 * 1024 * 1024) {
                    if (File.Exists(p + ".old")) File.Delete(p + ".old");
                    File.Move(p, p + ".old");
                }
                File.AppendAllText(p, DateTime.Now.ToString("s") + " " + message + Environment.NewLine, Encoding.UTF8);
            }} catch { }
        }
        internal static string Extract() {
            var asm = Assembly.GetExecutingAssembly();
            string id;
            using (var r = new StreamReader(asm.GetManifestResourceStream("payload.id"))) id = r.ReadToEnd().Trim();
            string releases = Path.Combine(Root, "releases");
            Directory.CreateDirectory(releases);
            string destination = Path.Combine(releases, id);
            string marker = Path.Combine(destination, ".complete");
            if (File.Exists(marker) && File.Exists(Path.Combine(destination, "node.exe")) && File.Exists(Path.Combine(destination, "app", "dist-cli", "index.js"))) return destination;
            if (Directory.Exists(destination)) throw new IOException("运行文件不完整，请从日志目录旁的 releases 文件夹移走对应版本后重启程序。");
            string staging = Path.Combine(releases, id + ".tmp-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(staging);
            using (var stream = asm.GetManifestResourceStream("payload.zip"))
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read)) {
                foreach (var entry in archive.Entries) {
                    string target = Path.GetFullPath(Path.Combine(staging, entry.FullName));
                    if (!target.StartsWith(staging + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("运行包路径无效。");
                    if (String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(target); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    using (var source = entry.Open()) using (var file = File.Create(target)) source.CopyTo(file);
                }
            }
            File.WriteAllText(Path.Combine(staging, ".complete"), id);
            Directory.Move(staging, destination);
            return destination;
        }
    }

    internal sealed class Runtime : IServiceRuntime, IDisposable {
        Process service;
        Job job;
        internal int ServicePid { get { try { return ServiceRunning ? service.Id : 0; } catch { return 0; } } }
        public bool ServiceRunning { get { try { return service != null && !service.HasExited; } catch { return false; } } }
        public bool DesktopRunning() {
            int session = Process.GetCurrentProcess().SessionId;
            foreach (string name in new [] { "ChatGPT", "Codex" }) {
                foreach (var p in Process.GetProcessesByName(name)) using (p) {
                    try {
                        if (p.SessionId == session && DesktopIdentity.Matches(name, p.MainModule.FileName)) return true;
                    } catch (System.ComponentModel.Win32Exception) { }
                    catch (InvalidOperationException) { }
                }
            }
            return false;
        }
        public void Start() {
            Stop();
            if (IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(x => x.Port == 18923))
                throw new IOException("端口 18923 已被占用，请先关闭旧版网页服务；不会停止其他程序。");
            if (Paths.Payload == null) Paths.Payload = Paths.Extract();
            string codexRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenAI", "Codex", "bin");
            string codex = Directory.Exists(codexRoot) ? Directory.GetDirectories(codexRoot).Select(x => Path.Combine(x, "codex.exe")).Where(File.Exists).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault() : null;
            if (codex == null) throw new IOException("未找到已安装的 Codex，请先打开 Codex 桌面程序。");
            string home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex");
            if (!Directory.Exists(home)) throw new IOException("未找到 Codex 配置，请先完成桌面程序登录。");
            string workspace = Path.Combine(Paths.Root, "workspace");
            Directory.CreateDirectory(workspace);
            var si = new ProcessStartInfo(Path.Combine(Paths.Payload, "node.exe"), "\"" + Path.Combine(Paths.Payload, "bootstrap.cjs") + "\" --host 127.0.0.1 --port 18923 --no-tunnel --no-open --no-login --sandbox-mode workspace-write --approval-policy on-request");
            si.WorkingDirectory = workspace; si.UseShellExecute = false; si.CreateNoWindow = true;
            si.RedirectStandardInput = true; si.RedirectStandardOutput = true; si.RedirectStandardError = true;
            si.StandardOutputEncoding = Encoding.UTF8; si.StandardErrorEncoding = Encoding.UTF8;
            si.EnvironmentVariables["CODEX_HOME"] = home;
            si.EnvironmentVariables["CODEXUI_CODEX_COMMAND"] = codex;
            si.EnvironmentVariables["CODEX_TRAY_APP_ROOT"] = Path.Combine(Paths.Payload, "app");
            string deps = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies");
            var dirs = new List<string> { Path.GetDirectoryName(codex), Paths.Payload };
            foreach (string rel in new [] { "python", "python\\Scripts", "native\\git\\cmd", "native\\git\\bin", "native\\powershell", "bin\\override", "bin\\fallback" }) {
                string d = Path.Combine(deps, rel); if (Directory.Exists(d)) dirs.Add(d);
            }
            si.EnvironmentVariables["PATH"] = String.Join(";", dirs) + ";" + si.EnvironmentVariables["PATH"];
            ConfigureProxy(si);
            job = new Job();
            service = new Process { StartInfo = si };
            service.OutputDataReceived += (s, e) => { if (e.Data != null) Paths.Log(e.Data, true); };
            service.ErrorDataReceived += (s, e) => { if (e.Data != null) Paths.Log(e.Data, true); };
            try {
                service.Start();
                job.Assign(service);
                service.BeginOutputReadLine(); service.BeginErrorReadLine();
                service.StandardInput.WriteLine(new JavaScriptSerializer().Serialize(new { password = Secrets.Password(home) })); service.StandardInput.Flush();
                Paths.Log("Started owned service PID " + service.Id);
            } catch { Stop(); throw; }
        }
        internal static void ConfigureProxy(ProcessStartInfo si) {
            using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings")) {
                if (k != null && Convert.ToInt32(k.GetValue("ProxyEnable", 0)) == 1) {
                    string raw = Convert.ToString(k.GetValue("ProxyServer", ""));
                    foreach (string protocol in new [] { "http", "https" }) {
                        string key = protocol.ToUpperInvariant() + "_PROXY";
                        if (!String.IsNullOrWhiteSpace(si.EnvironmentVariables[key])) continue;
                        string chosen = raw;
                        if (raw.Contains("=")) {
                            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                            foreach (string part in raw.Split(';')) { var pair = part.Split(new [] { '=' }, 2); if (pair.Length == 2) values[pair[0].Trim()] = pair[1].Trim(); }
                            if (!values.TryGetValue(protocol, out chosen)) values.TryGetValue("http", out chosen);
                        }
                        if (String.IsNullOrWhiteSpace(chosen)) continue;
                        if (!chosen.Contains("://")) chosen = "http://" + chosen;
                        Uri uri;
                        if (Uri.TryCreate(chosen, UriKind.Absolute, out uri) && (uri.Scheme == "http" || uri.Scheme == "https")) si.EnvironmentVariables[key] = chosen;
                    }
                }
            }
            si.EnvironmentVariables["NO_PROXY"] = "localhost,127.0.0.1,::1," + si.EnvironmentVariables["NO_PROXY"];
            si.EnvironmentVariables["NODE_USE_ENV_PROXY"] = "1";
        }
        public bool Healthy() {
            if (!ServiceRunning || !OwnsLoopbackPort(service.Id)) return false;
            try {
                var req = (HttpWebRequest)WebRequest.Create(Paths.Url + "codex-api/rpc");
                req.Proxy = null; req.Timeout = 1800; req.ReadWriteTimeout = 1800;
                req.Method = "POST"; req.ContentType = "application/json";
                byte[] body = Encoding.UTF8.GetBytes("{\"method\":\"account/read\",\"params\":{\"refreshToken\":false}}");
                req.ContentLength = body.Length;
                using (var stream = req.GetRequestStream()) stream.Write(body, 0, body.Length);
                using (var response = req.GetResponse()) using (var reader = new StreamReader(response.GetResponseStream())) {
                    var obj = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
                    object result;
                    if (!obj.TryGetValue("result", out result) || obj.ContainsKey("error")) return false;
                    var account = result as Dictionary<string, object>;
                    return account != null && account.ContainsKey("account") && account["account"] != null;
                }
            } catch (WebException) { return false; }
            catch (ArgumentException) { return false; }
        }
        [DllImport("iphlpapi.dll", SetLastError=true)] static extern uint GetExtendedTcpTable(IntPtr table, ref int length, bool order, int family, int tableClass, uint reserved);
        [StructLayout(LayoutKind.Sequential)] struct TcpOwnerRow {
            public uint State, Address, Port, RemoteAddress, RemotePort, Pid;
        }
        static bool OwnsLoopbackPort(int pid) {
            int length = 0;
            GetExtendedTcpTable(IntPtr.Zero, ref length, false, 2, 3, 0);
            if (length < 4) return false;
            IntPtr table = Marshal.AllocHGlobal(length);
            try {
                if (GetExtendedTcpTable(table, ref length, false, 2, 3, 0) != 0) return false;
                int count = Marshal.ReadInt32(table), size = Marshal.SizeOf(typeof(TcpOwnerRow));
                for (int i = 0; i < count && 4 + (i + 1) * size <= length; i++) {
                    var row = (TcpOwnerRow)Marshal.PtrToStructure(IntPtr.Add(table, 4 + i * size), typeof(TcpOwnerRow));
                    int port = (int)(((row.Port & 255) << 8) | ((row.Port >> 8) & 255));
                    if (port == 18923 && row.Address == 0x0100007f && row.Pid == pid) return true;
                }
                return false;
            } finally { Marshal.FreeHGlobal(table); }
        }
        public void Stop() {
            if (job != null) { job.Dispose(); job = null; }
            if (service != null) {
                try {
                    if (!service.HasExited) { if (!service.WaitForExit(2500)) service.Kill(); }
                    Paths.Log("Stopped owned service PID " + service.Id);
                } catch (InvalidOperationException) { }
                service.Dispose(); service = null;
            }
        }
        public void Dispose() { Stop(); }
    }

    // A private job owns only this launcher's Node process and descendants.
    internal sealed class Job : IDisposable {
        IntPtr handle;
        [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
            public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
            public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
        [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
            public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, IntPtr info, uint length);
        [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        internal Job() {
            handle = CreateJobObject(IntPtr.Zero, null);
            if (handle == IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
            var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000;
            int length = Marshal.SizeOf(limits); IntPtr memory = Marshal.AllocHGlobal(length);
            try {
                Marshal.StructureToPtr(limits, memory, false);
                if (!SetInformationJobObject(handle, 9, memory, (uint)length)) { int code = Marshal.GetLastWin32Error(); Dispose(); throw new System.ComponentModel.Win32Exception(code); }
            } finally { Marshal.FreeHGlobal(memory); }
        }
        internal void Assign(Process p) { if (!AssignProcessToJobObject(handle, p.Handle)) throw new System.ComponentModel.Win32Exception(); }
        public void Dispose() { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
    }
}
