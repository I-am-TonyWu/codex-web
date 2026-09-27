using System;
using System.IO;
using System.IO.Pipes;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Win32;

[assembly: AssemblyTitle("Codex 网页托盘")]
[assembly: AssemblyDescription("本地 Codex 网页服务与桌面程序状态监控")]
[assembly: AssemblyVersion("1.4.3.1")]
[assembly: AssemblyFileVersion("1.4.3.1")]

namespace CodexWebTray {
    internal static class Startup {
        const string Key = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string Name = "CodexWebTray";
        internal static string Command { get { return "\"" + Application.ExecutablePath + "\" --autostart"; } }
        internal static string SavedCommand { get { using(var key=Registry.CurrentUser.OpenSubKey(Key)) return key==null ? "" : Convert.ToString(key.GetValue(Name,"")); } }
        internal static bool Enabled {
            get { using (var k = Registry.CurrentUser.OpenSubKey(Key)) return k != null && String.Equals(Convert.ToString(k.GetValue(Name, "")), Command, StringComparison.OrdinalIgnoreCase); }
        }
        internal static void Set(bool value) {
            using (var k = Registry.CurrentUser.CreateSubKey(Key)) {
                if (value) k.SetValue(Name, Command, RegistryValueKind.String);
                else k.DeleteValue(Name, false);
            }
            Paths.Log("Login startup " + (value ? "enabled" : "disabled"));
        }
        internal static void RepairStaleEntry() {
            string saved = SavedCommand;
            if (saved.Length == 0 || Enabled) return;
            if (saved.EndsWith("\\CodexWebTray.exe\" --autostart", StringComparison.OrdinalIgnoreCase)) Set(true);
        }
    }

    internal static class Icons {
        [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);
        internal static Color ColorFor(Lamp lamp) {
            switch (lamp) {
                case Lamp.Healthy: return Color.FromArgb(34, 197, 94);
                case Lamp.Error: return Color.FromArgb(239, 68, 68);
                case Lamp.Paused: return Color.FromArgb(148, 163, 184);
                default: return Color.FromArgb(250, 191, 36);
            }
        }
        internal static Bitmap Draw(int size, Color color) {
            var b = new Bitmap(size, size);
            using (var g = Graphics.FromImage(b)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.ScaleTransform(size / 64f, size / 64f);
                using (var brush = new SolidBrush(Color.FromArgb(20, 30, 47))) g.FillEllipse(brush, 2, 2, 60, 60);
                using (var pen = new Pen(color, 6)) g.DrawEllipse(pen, 6, 6, 52, 52);
                using (var pen = new Pen(Color.White, 4.6f)) {
                    pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round; pen.LineJoin = LineJoin.Round;
                    g.DrawLines(pen, new [] { new PointF(25, 23), new PointF(16, 32), new PointF(25, 41) });
                    g.DrawLines(pen, new [] { new PointF(39, 23), new PointF(48, 32), new PointF(39, 41) });
                    g.DrawLine(pen, 35, 23, 29, 41);
                }
            }
            return b;
        }
        internal static Icon Make(Lamp state) {
            using (var bitmap = Draw(32, ColorFor(state))) {
                IntPtr h = bitmap.GetHicon();
                try { using (var icon = Icon.FromHandle(h)) return (Icon)icon.Clone(); }
                finally { DestroyIcon(h); }
            }
        }
    }

    internal sealed class TrayContext : ApplicationContext {
        readonly NotifyIcon tray;
        readonly Control dispatcher = new Control();
        readonly System.Windows.Forms.Timer timer;
        readonly Runtime runtime = new Runtime();
        readonly Monitor monitor;
        readonly object gate = new object();
        readonly Icon[] icons = new Icon[4];
        readonly ToolStripMenuItem status, start, stop, retry, startup, open;
        int busy;
        volatile bool closing;
        int restartRequested;
        volatile string snapshot = "{\"state\":\"Waiting\",\"detail\":\"正在初始化\"}";
        Lamp? lastState;
        string lastDetail;
        Form panel;
        Label panelStatus;
        Label panelDetail;
        CheckBox panelStartup;
        Button panelOpen, panelStart, panelStop;
        Button panelRetry;
        readonly DateTime started = DateTime.UtcNow;
        internal TrayContext(bool show) {
            var unused = dispatcher.Handle;
            monitor = new Monitor(runtime);
            foreach (Lamp l in Enum.GetValues(typeof(Lamp))) icons[(int)l] = Icons.Make(l);
            var menu = new ContextMenuStrip { Font = new Font("Microsoft YaHei UI", 10), ShowImageMargin = false, ShowCheckMargin = true };
            status = new ToolStripMenuItem("等待 Codex 启动") { Enabled = false };
            open = new ToolStripMenuItem("打开网页", null, (s,e) => OpenWeb());
            start = new ToolStripMenuItem("开启服务（自动跟随 Codex）", null, (s,e) => Enable());
            stop = new ToolStripMenuItem("关闭服务（暂停自动启动）", null, (s,e) => Disable());
            retry = new ToolStripMenuItem("重试 / 重启服务", null, (s,e) => Restart());
            startup = new ToolStripMenuItem("开机自启（登录 Windows 后）", null, (s,e) => SetStartup(!Startup.Enabled));
            menu.Items.AddRange(new ToolStripItem[] { status, new ToolStripSeparator(), open,
                new ToolStripMenuItem("设置", null, (s,e) => ShowPanel()),
                new ToolStripSeparator(), new ToolStripMenuItem("退出", null, (s,e) => Exit()) });
            tray = new NotifyIcon { Visible = true, Icon = icons[(int)Lamp.Waiting], Text = "Codex 网页：正在初始化", ContextMenuStrip = menu };
            tray.DoubleClick += (s,e) => { if (monitor.State == Lamp.Healthy) OpenWeb(); else ShowPanel(); };
            timer = new System.Windows.Forms.Timer { Interval = 3000 };
            timer.Tick += (s,e) => Poll(); timer.Start();
            SystemEvents.SessionEnding += OnSessionEnding;
            UpdateUi();
            Task.Run((Action)PipeLoop);
            Poll();
            if (show) ShowPanel();

        }
        void OnSessionEnding(object sender, SessionEndingEventArgs e) { closing = true; lock(gate) runtime.Dispose(); }
        internal void Poll() {
            if (closing || Interlocked.CompareExchange(ref busy, 1, 0) != 0) return;
            Task.Run(() => {
                try { lock (gate) {
                    if (closing) return;
                    if (Interlocked.Exchange(ref restartRequested, 0) == 1) { runtime.Stop(); monitor.Retry(); }
                    monitor.Tick(DateTime.UtcNow);
                    if (lastState != monitor.State || lastDetail != monitor.Detail) {
                        Paths.Log(monitor.State + ": " + monitor.Detail); lastState = monitor.State; lastDetail = monitor.Detail;
                    }
                    snapshot = new JavaScriptSerializer().Serialize(new {
                        state = monitor.State.ToString(), detail = monitor.Detail, enabled = monitor.Enabled,
                        desktopRunning = monitor.Desktop, servicePid = runtime.ServicePid, url = Paths.Url,
                        pollSeconds = 3, autoStart = Startup.Enabled, trayVisible = tray.Visible,
                        dataRoot = Paths.Root,
                        hasCloudflareTokenRegistry = Secrets.HasStoredToken, executable = Application.ExecutablePath, version = Assembly.GetExecutingAssembly().GetName().Version.ToString(), userSid = WindowsIdentity.GetCurrent().User.Value, hasCloudflareTokenFile = File.Exists(Path.Combine(Secrets.DirectoryPath, "cloudflare-token.dat")),
                        startupCommand = Startup.SavedCommand,
                        updatedAt = DateTime.UtcNow.ToString("o"), uptimeSeconds = (int)(DateTime.UtcNow - started).TotalSeconds
                    });
                }} catch (Exception ex) { Paths.Log("Monitor error: " + ex.Message); }
                finally {
                    Interlocked.Exchange(ref busy, 0);
                    if (!closing) try { dispatcher.BeginInvoke((Action)UpdateUi); } catch (InvalidOperationException) { }
                }
            });
        }
        void Enable() { if (monitor.Enabled && monitor.State == Lamp.Healthy) return; monitor.Enabled = true; Interlocked.Exchange(ref restartRequested, 1); Poll(); }
        void Disable() { monitor.Enabled = false; Interlocked.Exchange(ref restartRequested, 0); Poll(); }
        void Restart() { monitor.Enabled = true; Interlocked.Exchange(ref restartRequested, 1); Poll(); }
        void SetStartup(bool value) {
            try { Startup.Set(value); UpdateUi(); Poll(); }
            catch (Exception ex) { MessageBox.Show("无法修改开机自启：" + ex.Message, "Codex 网页托盘"); }
        }
        void OpenWeb() { try { Process.Start(new ProcessStartInfo(Paths.Url) { UseShellExecute = true }); } catch (Exception ex) { Paths.Log(ex.Message); } }
        void OpenLogs() { Directory.CreateDirectory(Paths.Logs); Process.Start(new ProcessStartInfo(Paths.Logs) { UseShellExecute = true }); }
        void ChangePassword() {
            SecurityDialogs.Password(panel, (password,revoke) => {
                lock(gate) {
                    string home=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".codex");
                    string previous=Secrets.Password(home);
                    runtime.Stop();
                    try {
                        Secrets.Save("web-password",password);
                        if(revoke) {string sessions=Path.Combine(home,"webui-auth-sessions.json");if(File.Exists(sessions))File.Delete(sessions);}
                        // Retire the legacy plaintext output so it cannot be mistaken for the new password.
                        string legacy=Path.Combine(home,"codexui-password");if(File.Exists(legacy))File.Delete(legacy);
                    } catch {Secrets.Save("web-password",previous);throw;}
                    monitor.Retry();
                }
                Poll();
            });
        }
        void UpdateUi() {
            if (closing) return;
            Lamp state = monitor.State;
            tray.Icon = icons[(int)state];
            string brief = state == Lamp.Healthy ? "网页服务正常" : state == Lamp.Waiting ? "等待 Codex 启动" : state == Lamp.Paused ? "服务已手动关闭" : "服务异常或正在启动";
            tray.Text = "Codex 网页：" + brief;
            status.Text = brief;
            open.Enabled = state == Lamp.Healthy;
            start.Enabled = !monitor.Enabled;
            stop.Enabled = monitor.Enabled;
            retry.Enabled = monitor.Desktop;
            startup.Checked = Startup.Enabled;
            if (panel != null && !panel.IsDisposed) {
                panel.Icon = icons[(int)state];
                panelStatus.Text = brief; panelStatus.ForeColor = Icons.ColorFor(state);
                panelDetail.Text = state == Lamp.Healthy ? "Codex 已连接 · 每 3 秒自动检测" : monitor.Detail;
                panelStartup.Checked = Startup.Enabled;
                panelOpen.Enabled = open.Enabled;
                panelStart.Enabled = start.Enabled;
                panelStop.Enabled = stop.Enabled;
                panelRetry.Enabled = retry.Enabled;
            }
        }
        internal void ShowPanel() {
            if (panel != null && !panel.IsDisposed) { panel.Show(); panel.Activate(); return; }
            panel = new Form { Text = "Codex 网页 · 设置", AutoScaleMode = AutoScaleMode.None, ClientSize = new Size(560, 580), StartPosition = FormStartPosition.CenterScreen,
                FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, Font = new Font("Microsoft YaHei UI", 10),
                BackColor = Color.FromArgb(17, 24, 39), ForeColor = Color.FromArgb(235,240,248), Icon = icons[(int)monitor.State] };
            AddLabel(panel, "Codex 网页", 28, 22, 340, 34, 20, true);
            AddLabel(panel, "本地服务管理", 30, 62, 400, 24, 10, false);
            var serviceCard = AddCard(90, 160);
            panelStatus = AddLabel(serviceCard, "", 20, 16, 340, 28, 14, true);
            panelDetail = AddLabel(serviceCard, "", 20, 50, 462, 36, 10, false);
            AddLabel(serviceCard, Paths.Url, 20, 87, 450, 24, 10, false);
            panelOpen = AddButton(serviceCard, "打开网页", 20, 120, 108, OpenWeb, true);
            panelStart = AddButton(serviceCard, "开启服务", 140, 120, 108, Enable);
            panelStop = AddButton(serviceCard, "关闭服务", 260, 120, 108, Disable);
            panelRetry = AddButton(serviceCard, "重启服务", 380, 120, 108, Restart);
            var settingsCard = AddCard(262, 82);
            AddLabel(settingsCard, "启动设置", 20, 12, 440, 24, 11, true);
            panelStartup = new CheckBox { Location = new Point(20, 46), Size = new Size(224, 25), Text = "登录 Windows 后启动", FlatStyle = FlatStyle.Standard };
            panelStartup.Click += (s,e) => SetStartup(panelStartup.Checked);
            settingsCard.Controls.Add(panelStartup);
            AddButton(settingsCard, "查看日志", 340, 38, 148, OpenLogs);
            var securityCard=AddCard(356,102);
            AddLabel(securityCard,"登录与远程访问",20,12,450,24,11,true);
            AddButton(securityCard,"修改网页密码",20,52,144,ChangePassword);
            AddButton(securityCard,"Access 登录",180,52,144,()=>SecurityDialogs.Access(panel));
            AddButton(securityCard,"Cloudflare 站点",340,52,148,()=>SecurityDialogs.Site(panel));
            var githubIcon = new PictureBox { Location=new Point(30,494), Size=new Size(28,28), SizeMode=PictureBoxSizeMode.Zoom, BackColor=Color.White };
            using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("github-mark.png"))
            using(var bitmap=Image.FromStream(stream)) githubIcon.Image=new Bitmap(bitmap);
            panel.Controls.Add(githubIcon);
            AddLabel(panel,"本程序基于 GitHub 中",68,488,450,22,9,false);
            var sourceLink=new LinkLabel { Text="friuns2/codex-mobile v0.1.91", Location=new Point(68,510), Size=new Size(278,24), LinkColor=Color.FromArgb(125,190,255), ActiveLinkColor=Color.White, VisitedLinkColor=Color.FromArgb(125,190,255) };
            sourceLink.LinkClicked += (s,e) => { try { Process.Start(new ProcessStartInfo("https://github.com/friuns2/codex-mobile") { UseShellExecute=true }); } catch(Exception ex) { MessageBox.Show(ex.Message,"无法打开项目网页"); } };
            panel.Controls.Add(sourceLink);
            AddLabel(panel,"项目重构",352,510,150,24,9,false);
            panel.FormClosed += (s,e) => githubIcon.Image.Dispose();
            AddLabel(panel, "关闭窗口后仍在托盘运行", 30, 540, 370, 24, 9, false);
            var version = AddLabel(panel, "v" + Assembly.GetExecutingAssembly().GetName().Version.ToString(), 430, 540, 100, 24, 9, false);
            version.TextAlign = ContentAlignment.TopRight;
            panel.FormClosed += (s,e) => { panel = null; };
            // The host uses 250% display scaling. Scale the geometry once while
            // point-based fonts already render at the system DPI.
            using (var g = panel.CreateGraphics()) {
                float scale = g.DpiX / 96f;
                if (scale > 1.01f) panel.Scale(new SizeF(scale, scale));
            }
            UpdateUi(); panel.Show(); SecurityDialogs.FitScreen(panel);
            if (!panel.Visible) panel.Show();
            panel.Activate();
        }
        Panel AddCard(int y, int height) {
            var card = new Panel { Location = new Point(26,y), Size = new Size(508,height), BackColor = Color.FromArgb(27,38,55) };
            panel.Controls.Add(card); return card;
        }
        Label AddLabel(Control parent, string text, int x, int y, int width, int height, float size, bool bold) {
            var label = new Label { Text = text, Location = new Point(x,y), Size = new Size(width,height),
                ForeColor = bold ? Color.FromArgb(235,240,248) : Color.FromArgb(166,181,201),
                Font = new Font("Microsoft YaHei UI", size, bold ? FontStyle.Bold : FontStyle.Regular) };
            parent.Controls.Add(label); return label;
        }
        Button AddButton(Control parent, string label, int x, int y, int width, Action action, bool primary = false) {
            var b = new Button { Text = label, Location = new Point(x,y), Size = new Size(width,34), FlatStyle = FlatStyle.Flat,
                BackColor = primary ? Color.FromArgb(37,99,180) : Color.FromArgb(43,58,78), Cursor = Cursors.Hand };
            b.FlatAppearance.BorderSize = 0;
            b.Click += (s,e) => action(); parent.Controls.Add(b); return b;
        }
        void PipeLoop() {
            while (!closing) {
                try {
                    var security = new PipeSecurity();
                    security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
                    using (var pipe = new NamedPipeServerStream(Program.PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 4096, 4096, security)) {
                        pipe.WaitForConnection();
                        var buf = new byte[128];
                        var read = pipe.BeginRead(buf, 0, buf.Length, null, null);
                        if (!read.AsyncWaitHandle.WaitOne(3000)) continue;
                        int count = pipe.EndRead(read);
                        string cmd = System.Text.Encoding.UTF8.GetString(buf, 0, count).Trim();
                        string result = snapshot;
                        if (cmd == "access-check") {
                            try {
                                string value=Secrets.Read("cloudflare-token");
                                result=new JavaScriptSerializer().Serialize(new { tokenLoaded=!String.IsNullOrWhiteSpace(value), encryptedRegistry=Secrets.HasStoredToken, emailCount=AccessClient.Emails(AccessClient.Load(value)).Length });
                            } catch(Exception ex) { result=new JavaScriptSerializer().Serialize(new { errorType=ex.GetType().Name }); }
                        }
                        else if (cmd != "status") {
                            dispatcher.Invoke((Action)(() => {
                                switch (cmd) {
                                    case "start": Enable(); break;
                                    case "stop": Disable(); break;
                                    case "restart": Restart(); break;
                                    case "autostart-on": SetStartup(true); break;
                                    case "autostart-off": SetStartup(false); break;
                                    case "show": ShowPanel(); break;
                                    case "exit": dispatcher.BeginInvoke((Action)Exit); break;
                                    default: throw new ArgumentException("Unknown command");
                                }
                            }));
                            result = "{\"accepted\":true}";
                        }
                        var bytes = System.Text.Encoding.UTF8.GetBytes(result + "\n");
                        pipe.Write(bytes, 0, bytes.Length); pipe.Flush();
                    }
                } catch (Exception ex) { if (!closing) { Paths.Log("IPC: " + ex.Message); Thread.Sleep(250); } }
            }
        }
        async void Exit() {
            if (closing) return;
            closing = true; timer.Stop(); tray.Text = "Codex 网页：正在停止服务";
            await Task.Run(() => { lock (gate) runtime.Dispose(); });
            tray.Visible = false; tray.Dispose();
            if (panel != null) panel.Close();
            timer.Dispose(); foreach (var icon in icons) icon.Dispose();
            SystemEvents.SessionEnding -= OnSessionEnding;
            dispatcher.Dispose(); ExitThread();
        }
        protected override void Dispose(bool disposing) {
            if (disposing) { closing = true; lock(gate) runtime.Dispose(); tray.Visible = false; tray.Dispose(); }
            base.Dispose(disposing);
        }
    }

    internal static class Program {
        internal static readonly string PipeName = "CodexWebTray-" + WindowsIdentity.GetCurrent().User.Value + "-" + Process.GetCurrentProcess().SessionId;
        internal static string Send(string command) {
            using (var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous)) {
                pipe.Connect(3000);
                byte[] data = System.Text.Encoding.UTF8.GetBytes(command + "\n"); pipe.Write(data, 0, data.Length); pipe.Flush();
                using (var reader = new StreamReader(pipe)) {
                    var task = reader.ReadLineAsync();
                    if (!task.Wait(7000)) throw new IOException("程序暂未响应。");
                    return task.Result;
                }
            }
        }
        [STAThread] static int Main(string[] args) {
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            try {
                if (args.Length >= 2 && args[0] == "--command") {
                    string response = Send(args[1]);
                    if (args.Length == 4 && args[2] == "--result") File.WriteAllText(args[3], response, System.Text.Encoding.UTF8);
                    else Console.WriteLine(response);
                    return 0;
                }
                bool first;
                using (var mutex = new Mutex(true, "Local\\" + PipeName, out first)) {
                    if (!first) { if (Array.IndexOf(args, "--autostart") < 0) try { Send("start"); Send("show"); } catch { } return 0; }
                    try {
                        Directory.CreateDirectory(Paths.Root);
                        Startup.RepairStaleEntry();
                        Paths.Log("Tray starting " + Assembly.GetExecutingAssembly().GetName().Version);
                        using (var context = new TrayContext(Array.IndexOf(args, "--show") >= 0)) Application.Run(context);
                    } finally { mutex.ReleaseMutex(); }
                }
                return 0;
            } catch (Exception ex) {
                Paths.Log("Fatal: " + ex);
                if (args.Length < 1 || args[0] != "--command") MessageBox.Show(ex.Message, "Codex 网页托盘", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
