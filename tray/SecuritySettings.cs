using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Net;
using System.Net.Mail;
using System.Collections;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace CodexWebTray {
    internal static class Secrets {
        internal static string DirectoryPath = Path.Combine(Paths.Root, "secrets");
        internal static string RegistryPath = @"Software\CodexWebTray\Secrets";
        internal static bool HasStoredToken {
            get { using(var key=Registry.CurrentUser.OpenSubKey(RegistryPath))
                return key!=null && key.GetValue("cloudflare-token") is byte[]; }
        }
        internal static string Read(string name) {
            if(name=="cloudflare-token") {
                using(var key=Registry.CurrentUser.OpenSubKey(RegistryPath)) {
                    var encrypted=key==null?null:key.GetValue(name) as byte[];
                    if(encrypted!=null) return Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted,null,DataProtectionScope.CurrentUser));
                }
            }
            string file = Path.Combine(DirectoryPath, name + ".dat");
            byte[] bytes;
            try { bytes=File.ReadAllBytes(file); }
            catch(FileNotFoundException) { return null; }
            catch(DirectoryNotFoundException) { return null; }
            var value=Encoding.UTF8.GetString(ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser));
            if(name=="cloudflare-token") {
                using(var key=Registry.CurrentUser.CreateSubKey(RegistryPath)) { key.SetValue(name,bytes,RegistryValueKind.Binary); key.Flush(); }
                Paths.Log("Access token migrated to current-user encrypted registry storage.");
            }
            return value;
        }
        internal static void Save(string name, string value) {
            var encrypted=ProtectedData.Protect(Encoding.UTF8.GetBytes(value),null,DataProtectionScope.CurrentUser);
            if(name=="cloudflare-token") {
                using(var key=Registry.CurrentUser.CreateSubKey(RegistryPath)) { key.SetValue(name,encrypted,RegistryValueKind.Binary); key.Flush(); }
            }
            Directory.CreateDirectory(DirectoryPath);
            string file = Path.Combine(DirectoryPath, name + ".dat"), temp = file + ".tmp";
            File.WriteAllBytes(temp, encrypted);
            if (File.Exists(file)) File.Replace(temp, file, null); else File.Move(temp, file);
        }
        internal static void Forget(string name) {
            string p = Path.Combine(DirectoryPath, name + ".dat"); File.Delete(p);
            if(name=="cloudflare-token") using(var key=Registry.CurrentUser.OpenSubKey(RegistryPath,true)) { if(key!=null) { key.DeleteValue(name,false); key.Flush(); } }
        }
        internal static string Password(string home) {
            string current = Read("web-password");
            if (!String.IsNullOrEmpty(current)) return current;
            string legacy = Path.Combine(home, "codexui-password");
            if (File.Exists(legacy)) current = File.ReadAllText(legacy).Trim();
            if (String.IsNullOrEmpty(current)) { byte[] bytes = new byte[24]; using(var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes); current = Convert.ToBase64String(bytes); }
            Save("web-password", current); return current;
        }
        internal static void ValidatePassword(string value) {
            if (String.IsNullOrWhiteSpace(value) || value.Length < 8 || value.Length > 20 || value.Any(Char.IsControl))
                throw new ArgumentException("密码需为 8–20 个字符，不能全为空格或包含换行。建议使用独立的长密码。");
        }
    }

    internal static class AccessClient {
        internal static string Account { get { return CloudflareSite.Load().AccountId; } }
        internal static string App { get { return CloudflareSite.Load().ApplicationId; } }
        internal static string Policy { get { return CloudflareSite.Load().PolicyId; } }
        internal static string Dashboard { get { return String.IsNullOrEmpty(Account) ? "https://dash.cloudflare.com/" : "https://dash.cloudflare.com/" + Account + "/one/access-controls/apps/self-hosted/" + App + "/edit"; } }
        internal static readonly string[] Durations = { "15m", "30m", "1h", "6h", "12h", "24h", "168h" };
        internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 4 * 1024 * 1024 };
        internal static Func<string,string,string,object,object> TestTransport = null;
        internal static object Request(string token, string method, string resource, object body) {
            if (String.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("请先配置 API Token。");
            if(TestTransport != null) return TestTransport(token,method,resource,body);
            CloudflareSite.Validate(CloudflareSite.Load());
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var req = (HttpWebRequest)WebRequest.Create("https://api.cloudflare.com/client/v4/accounts/" + Account + "/access/" + resource);
            req.Method = method; req.Headers["Authorization"] = "Bearer " + token;
            req.ContentType = "application/json"; req.Accept = "application/json"; req.UserAgent = "CodexWebTray/1.3";
            req.Timeout = 20000; req.ReadWriteTimeout = 20000; req.AllowAutoRedirect = false;
            req.Proxy = WebRequest.GetSystemWebProxy();
            try {
                if (body != null) { var bytes = Encoding.UTF8.GetBytes(Json.Serialize(body)); req.ContentLength = bytes.Length; using(var stream=req.GetRequestStream()) stream.Write(bytes,0,bytes.Length); }
                using(var response=req.GetResponse()) using(var reader=new StreamReader(response.GetResponseStream())) {
                    var envelope = Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
                    if (!envelope.ContainsKey("success") || !Object.Equals(envelope["success"], true)) throw new IOException("Cloudflare 未确认操作成功；请在控制台核对。");
                    return envelope["result"];
                }
            } catch (WebException ex) {
                var response = ex.Response as HttpWebResponse;
                string code = response == null ? ex.Status.ToString() : ((int)response.StatusCode).ToString();
                if(response != null) response.Close();
                throw new IOException("Cloudflare API 请求失败（" + code + "）。请检查令牌权限和网络；若保存超时，请先重新读取核对，不要盲目重试。");
            }
        }
        internal static object[] ArrayOf(object value) { var list=value as IEnumerable; return list == null || value is string ? new object[0] : list.Cast<object>().ToArray(); }
        internal static string[] Emails(Dictionary<string,object> policy) {
            if (!policy.ContainsKey("decision") || (string)policy["decision"] != "allow") throw new InvalidOperationException("仅支持当前 Allow 邮箱策略；请在控制台管理其他策略。");
            if (!policy.ContainsKey("app_count") || Convert.ToInt32(policy["app_count"]) != 1) throw new InvalidOperationException("策略未独占绑定一个应用，停止修改以免影响其他应用。");
            var emails = new List<string>();
            foreach(var raw in ArrayOf(policy["include"])) {
                var rule=raw as Dictionary<string,object>;
                if(rule == null || rule.Count != 1 || !rule.ContainsKey("email")) throw new InvalidOperationException("包含规则存在非邮箱条件，请在控制台修改，托盘不会覆盖复杂规则。");
                var email=rule["email"] as Dictionary<string,object>;
                if(email == null || !email.ContainsKey("email")) throw new InvalidDataException("邮箱规则格式无效。");
                emails.Add((string)email["email"]);
            }
            return emails.ToArray();
        }
        internal static string[] ParseEmails(string text) {
            var values=text.Split(new[]{'\r','\n',',',';'},StringSplitOptions.RemoveEmptyEntries).Select(x=>x.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if(values.Length == 0 || values.Length > 50) throw new ArgumentException("请填写 1–50 个完整邮箱地址，每行一个。");
            foreach(var value in values) {
                MailAddress address; try { address=new MailAddress(value); } catch { throw new ArgumentException("邮箱格式无效：" + value); }
                if(address.Address != value || value.Contains("*") || !value.Contains(".")) throw new ArgumentException("请填写完整邮箱，不能使用通配符或显示名：" + value);
            }
            return values;
        }
        internal static Dictionary<string,object> Load(string token) {
            var linked=ArrayOf(Request(token,"GET","apps/"+App+"/policies",null));
            if(!linked.Any(x => {var d=x as Dictionary<string,object>; return d != null && d.ContainsKey("id") && (string)d["id"]==Policy;})) throw new InvalidOperationException("指定策略已不再关联 Codex 应用；请在控制台核对。");
            var p=(Dictionary<string,object>)Request(token,"GET","policies/"+Policy,null); Emails(p); return p;
        }
        internal static Dictionary<string,object> BuildUpdate(Dictionary<string,object> current, string[] emails, string duration) {
            Emails(current); if(!Durations.Contains(duration)) throw new ArgumentException("请选择支持的会话时长。");
            var body=new Dictionary<string,object>(current);
            foreach(var key in new[]{"id","account_id","app_count","created_at","updated_at","reusable"}) body.Remove(key);
            body["include"]=emails.Select(e=>(object)new Dictionary<string,object>{{"email",new Dictionary<string,object>{{"email",e}}}}).ToArray();
            body["session_duration"]=duration; return body;
        }
        internal static void Save(string token, Dictionary<string,object> loaded, string[] emails, string duration) {
            var fresh=Load(token);
            if(Json.Serialize(fresh)!=Json.Serialize(loaded)) throw new InvalidOperationException("云端配置已发生变化。请重新读取后再保存。");
            Request(token,"PUT","policies/"+Policy,BuildUpdate(fresh,emails,duration));
            var checkedPolicy=Load(token);
            if(!Emails(checkedPolicy).OrderBy(x=>x).SequenceEqual(emails.OrderBy(x=>x)) || !Object.Equals(checkedPolicy["session_duration"],duration)) throw new IOException("保存后读取结果不一致，请重新读取并在控制台核对。");
        }
    }

    internal static class SecurityDialogs {
        internal static Form Window(string title, int height) {
            var form = new Form { Text=title, ClientSize=new Size(530,height), Font=new Font("Microsoft YaHei UI",10), StartPosition=FormStartPosition.CenterParent,
                FormBorderStyle=FormBorderStyle.FixedDialog, MaximizeBox=false, MinimizeBox=false, AutoScaleMode=AutoScaleMode.None };
            // Build all controls at 96-DPI geometry before scaling once. Setting
            // AutoScaleDimensions during dynamic construction skipped this pass.
            form.Load += (s,e) => {
                using(var g=form.CreateGraphics()) {
                    float scale=g.DpiX/96f;
                    if(scale>1.01f) form.Scale(new SizeF(scale,scale));
                }
                FitScreen(form);
            };
            form.Shown += (s,e) => FitScreen(form);
            return form;
        }
        internal static void FitScreen(Form form) {
            var area=Screen.FromControl(form).WorkingArea;
            form.AutoScroll=true;
            form.Size=new Size(Math.Min(form.Width,area.Width-24),Math.Min(form.Height,area.Height-24));
            form.Location=new Point(Math.Max(area.Left,Math.Min(form.Left,area.Right-form.Width)),Math.Max(area.Top,Math.Min(form.Top,area.Bottom-form.Height)));
        }
        static Label Label(Form f,string text,int y,int height=30) { var c=new Label { Text=text,Location=new Point(22,y),Size=new Size(486,height) }; f.Controls.Add(c);return c; }
        static TextBox Input(Form f,int y,bool secret=false,int height=30) {var t=new TextBox {Location=new Point(22,y),Size=new Size(486,height),UseSystemPasswordChar=secret};f.Controls.Add(t);return t;}
        static Button Button(Form f,string text,int x,int y,int width=148) { var b=new Button {Text=text,Location=new Point(x,y),Size=new Size(width,36)};f.Controls.Add(b);return b; }
        internal static void Password(IWin32Window owner, Action<string,bool> apply) { using(var f=PasswordWindow(apply)) f.ShowDialog(owner); }
        internal static Form PasswordWindow(Action<string,bool> apply) {
            var f=Window("网页登录密码",355); {
                Label(f,"密码保存在此 Windows 账户，重启后保持不变。",18);
                Label(f,"新密码（8–20 个字符）",58); var first=Input(f,86,true);
                Label(f,"再次输入",126);var second=Input(f,154,true);
                var revoke=new CheckBox {Text="同时注销所有网页密码会话（推荐）",Checked=true,Location=new Point(22,200),Size=new Size(480,30)}; f.Controls.Add(revoke);
                Label(f,"保存后会重启网页服务；桌面 Codex 不会关闭。",235);
                var save=Button(f,"保存密码",22,292);var cancel=Button(f,"取消",184,292);cancel.Click+=(s,e)=>f.Close();
                save.Click+=(s,e)=> {try {Secrets.ValidatePassword(first.Text);if(first.Text!=second.Text)throw new ArgumentException("两次输入的密码不一致。");apply(first.Text,revoke.Checked);first.Clear();second.Clear();MessageBox.Show(f,"密码已保存。网页服务将使用新密码启动。","已保存");f.Close();}catch(Exception ex){MessageBox.Show(f,ex.Message,"未完成");}};
                return f;
            }
        }
        internal static void Site(IWin32Window owner) { using(var f=SiteWindow()) f.ShowDialog(owner); }
        internal static Form SiteWindow() {
            var f=Window("Cloudflare 站点配置",430);
            SiteConfiguration site;
            try { site=CloudflareSite.Load(); } catch { site=new SiteConfiguration(); }
            Label(f,"仅配置管理目标；不会创建隧道或修改云端权限。",16);
            Label(f,"Account ID（账户 ID）",50); var account=Input(f,78); account.Text=site.AccountId??"";
            Label(f,"Application ID（Access 应用 ID）",116); var app=Input(f,144); app.Text=site.ApplicationId??"";
            Label(f,"Policy ID（此应用专用的 Allow 策略 ID）",182); var policy=Input(f,210); policy.Text=site.PolicyId??"";
            Label(f,"域名（例如 codex.example.com，不含协议）",248); var host=Input(f,276); host.Text=site.Hostname??"";
            var status=Label(f,"这些 ID 不是 API Token；Token 在 Access 登录中保存。",318,40);
            var save=Button(f,"保存到本机",22,372,220);
            save.Click+=(s,e)=>{try {
                CloudflareSite.Save(new SiteConfiguration { AccountId=account.Text.Trim(),ApplicationId=app.Text.Trim(),PolicyId=policy.Text.Trim(),Hostname=host.Text.Trim() });
                status.Text="已保存到本机。请重新打开 Access 登录窗口。";
            } catch(Exception ex) { status.Text=ex.Message; }};
            return f;
        }
        internal static void Access(IWin32Window owner) { using(var f=AccessWindow()) f.ShowDialog(owner); }
        internal static Form AccessWindow() {
            var f=Window("Cloudflare Access · 当前站点",630); {
                Label(f,"管理此站点的允许邮箱和策略登录有效期",16);
                Label(f,"API Token（仅需 Access: Apps and Policies 编辑权限）",48);
                var token=Input(f,78,true);string loadError=null;
                try { token.Text=Secrets.Read("cloudflare-token")??""; }
                catch(Exception ex) { loadError="已保存的令牌读取失败（"+ex.GetType().Name+"），请检查当前 Windows 账户和存储权限。"; Paths.Log("Access token read failed: "+ex.GetType().Name); }
                var remember=new CheckBox {Text="用 Windows 当前账户加密保存令牌",Checked=true,Location=new Point(22,114),Size=new Size(480,28)};f.Controls.Add(remember);
                var read=Button(f,"连接并读取",22,148);var forget=Button(f,"清除本机令牌",184,148);var dashboard=Button(f,"打开控制台",346,148);
                Label(f,"允许登录的邮箱（每行一个；所有人共享同一 Codex 环境）",202);
                var emails=Input(f,236,false,145);emails.Multiline=true;emails.ScrollBars=ScrollBars.Vertical;emails.Enabled=false;
                Label(f,"策略登录有效期（覆盖应用设置，主要作用于新会话）",392);
                var duration=new ComboBox {Location=new Point(22,424),Size=new Size(220,30),DropDownStyle=ComboBoxStyle.DropDownList};duration.Items.AddRange(AccessClient.Durations);duration.SelectedItem="12h";duration.Enabled=false;f.Controls.Add(duration);
                var status=Label(f,String.IsNullOrWhiteSpace(token.Text)?"尚未配置 API Token，请填入后连接。":"已加载本机加密保存的令牌，正在连接…",466,64);
                if(loadError!=null)status.Text=loadError;
                var save=Button(f,"保存到 Cloudflare",22,562,220);save.Enabled=false;
                var help=Button(f,"令牌设置说明",264,562,244);
                Dictionary<string,object> loaded=null;string loadedToken=null;bool working=false;
                Action<bool> busy=v=>{working=v;read.Enabled=!v;forget.Enabled=!v;token.Enabled=!v;remember.Enabled=!v;save.Enabled=!v&&loaded!=null;emails.Enabled=!v&&loaded!=null;duration.Enabled=!v&&loaded!=null;};
                f.FormClosing+=(s,e)=>{if(working)e.Cancel=true;};
                token.TextChanged+=(s,e)=>{loaded=null;save.Enabled=false;emails.Enabled=false;duration.Enabled=false;status.Text="令牌已变更，请重新连接读取。";};
                dashboard.Click+=(s,e)=>System.Diagnostics.Process.Start(AccessClient.Dashboard);
                help.Click+=(s,e)=>MessageBox.Show(f,"Cloudflare → 用户头像 → My Profile → API Tokens → Create Token → Custom token。\r\n\r\n权限：Account / Access: Apps and Policies / Edit（API 文档称 Write）。\r\n账户资源：仅当前账户。不要使用 Global API Key，也不要使用隧道 Token。\r\n\r\n把生成的 Token 粘贴到本窗口即可，无需发到聊天。令牌允许管理账户内 Access 应用和策略，请妥善保管。","配置 API Token");
                forget.Click+=(s,e)=>{Secrets.Forget("cloudflare-token");token.Clear();loaded=null;busy(false);status.Text="本机令牌已清除；云端令牌未撤销。";};
                read.Click+=async(s,e)=>{busy(true);status.Text="正在读取云端…";try{string value=token.Text.Trim();var p=await Task.Run(()=>AccessClient.Load(value));loaded=p;loadedToken=value;emails.Text=String.Join(Environment.NewLine,AccessClient.Emails(p));var current=p.ContainsKey("session_duration")?p["session_duration"] as string:null;duration.SelectedItem=AccessClient.Durations.Contains(current)?current:"12h";if(remember.Checked)Secrets.Save("cloudflare-token",value);else Secrets.Forget("cloudflare-token");status.Text="已读取云端。未修改任何访问权限。当前策略时长："+(String.IsNullOrEmpty(current)?"继承应用设置":current);}catch(Exception ex){loaded=null;status.Text=ex.Message;}finally{busy(false);}};
                save.Click+=async(s,e)=>{try{var wanted=AccessClient.ParseEmails(emails.Text);string time=(string)duration.SelectedItem;
                    if(MessageBox.Show(f,"将更新 当前站点 的允许邮箱：\r\n"+String.Join("\r\n",wanted)+"\r\n登录有效期："+time+"\r\n\r\n新增用户可访问共享 Codex 环境。移除邮箱不会主动撤销现有会话。确认保存？","确认访问权限",MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)!=DialogResult.Yes)return;
                    busy(true);status.Text="正在保存并核对…";await Task.Run(()=>AccessClient.Save(loadedToken,loaded,wanted,time));loaded=await Task.Run(()=>AccessClient.Load(loadedToken));status.Text="已保存并重新读取验证。现有会话需在控制台撤销。";
                }catch(Exception ex){loaded=null;status.Text=ex.Message;}finally{busy(false);}};
                f.Shown+=(s,e)=>{if(!String.IsNullOrWhiteSpace(token.Text))read.PerformClick();};
                return f;
            }
        }
    }
}
