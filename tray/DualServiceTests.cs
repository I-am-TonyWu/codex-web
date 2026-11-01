using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Diagnostics;
using System.Collections.Generic;
using System.Windows.Forms;
using System.Web.Script.Serialization;

namespace CodexWebTray {
    internal static class DualServiceTests {
        static void Check(bool value,string name) { if(!value)throw new Exception(name); Console.WriteLine("PASS "+name); }
        [STAThread] static int Main(string[] args) {
            if(args.Length>0 && args[0]=="echo") { Console.OutputEncoding=Encoding.UTF8;Console.Write(new JavaScriptSerializer().Serialize(args.Skip(1).ToArray()));return 0; }
            string root=Path.Combine(Path.GetTempPath(),"dual-service-tests-"+Guid.NewGuid().ToString("N"));
            try {
                Directory.CreateDirectory(root);
                OpenCodeService.ConfigPath=Path.Combine(root,"service.json");
                string password="original-password";
                Action write=()=>File.WriteAllText(OpenCodeService.ConfigPath,new JavaScriptSerializer().Serialize(new {password=password}));write();
                var commands=new List<string[]>();int status=200;
                OpenCodeService.TestProbe=p=>status==200?(p==password?200:401):status;
                OpenCodeService.TestCommand=a=>{commands.Add(a);if(a.Length==4 && a[1]=="set"){password=a[3];write();}return "";};
                var service=new OpenCodeService();service.Refresh();
                Check(service.State==Lamp.Healthy && commands.Count==0,"Monitoring authenticates without starting or stopping the daemon");
                status=401;service.Refresh();Check(service.State==Lamp.Error && service.Detail.Contains("认证失败"),"Authentication failure is not a healthy server");
                status=0;service.Refresh();Check(service.State==Lamp.Paused,"Absent server is gray and never auto-started");
                status=200;service.ChangePassword("新密码 & \"quoted\" \\ ending\\");
                Check(commands.Count==2 && commands[0][1]=="set" && commands[1].SequenceEqual(new[]{"service","start"}),"Password change uses official configuration and explicitly restores service");
                Check(OpenCodeService.Password()==password && service.State==Lamp.Healthy,"New password is read back and authenticated");
                bool rejected=false;try{service.Control("kill-all");}catch(ArgumentException){rejected=true;}Check(rejected && commands.Count==2,"Unsupported operation cannot start a process");
                string[] values={"spaces here","密码 & | $ ` % !","embedded\"quote","trailing\\","slashes\\\"quoted"};
                var si=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"echo "+String.Join(" ",values.Select(OpenCodeService.QuoteArgument))) {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,StandardOutputEncoding=Encoding.UTF8};
                using(var p=Process.Start(si)){string output=p.StandardOutput.ReadToEnd();p.WaitForExit();Check(values.SequenceEqual(new JavaScriptSerializer().Deserialize<string[]>(output)),"Windows argument round trip preserves Unicode, shell characters, quotes and backslashes");}
                CloudflareSite.FilePath=Path.Combine(root,"site.json");
                var site=new SiteConfiguration {AccountId=new string('a',32),ApplicationId="11111111-1111-4111-8111-111111111111",PolicyId="22222222-2222-4222-8222-222222222222",Hostname="codex.example.com",Hostnames=new[]{"codex.example.com","opencode.example.com"}};
                CloudflareSite.Save(site);Check(CloudflareSite.Load().Domains().Length==2,"Two exact hostnames survive save and reload");
                File.WriteAllText(CloudflareSite.FilePath,"{\"AccountId\":\""+site.AccountId+"\",\"ApplicationId\":\""+site.ApplicationId+"\",\"PolicyId\":\""+site.PolicyId+"\",\"Hostname\":\"codex.example.com\"}");
                Check(CloudflareSite.Load().Domains().Single()=="codex.example.com","Existing single-domain configuration remains compatible");
                CloudflareSite.Save(site);
                using(var f=SecurityDialogs.SiteWindow()) {
                    f.Show();Application.DoEvents();
                    var fields=f.Controls.OfType<TextBox>().ToArray();
                    Check(fields.Length==4 && fields.All(t=>!String.IsNullOrEmpty(t.Text)),"Shown site dialog retains all four loaded values");
                    Check(fields.Single(t=>t.Multiline).Text.Contains("opencode.example.com"),"Shown dialog includes both protected hostnames");
                    File.WriteAllText(CloudflareSite.FilePath,"invalid json");
                    f.Controls.OfType<Button>().Single(b=>b.Text=="重新读取").PerformClick();Application.DoEvents();
                    Check(!f.Controls.OfType<Button>().Single(b=>b.Text=="保存到本机").Enabled && fields.All(t=>!String.IsNullOrEmpty(t.Text)),"Failed refresh preserves visible values and prevents overwriting configuration");
                    f.Close();
                }
                using(var f=SecurityDialogs.PasswordWindow((value,revoke)=>{},true)) {
                    Check(f.Controls.OfType<TextBox>().All(t=>t.UseSystemPasswordChar),"OpenCode password inputs are masked");
                    Check(!f.Controls.OfType<CheckBox>().Single().Enabled,"OpenCode session revocation is mandatory");
                }
                using(var bitmap=Icons.Draw(32,Icons.ColorFor(Lamp.Healthy),Icons.ColorFor(Lamp.Error))) {
                    Check(bitmap.GetPixel(3,16).G>bitmap.GetPixel(3,16).R && bitmap.GetPixel(29,16).R>bitmap.GetPixel(29,16).G,"Left Codex and right OpenCode status colors are independent");
                }
                return 0;
            }catch(Exception ex){Console.Error.WriteLine("FAIL "+ex);return 1;}
            finally {OpenCodeService.TestCommand=null;OpenCodeService.TestProbe=null;Directory.Delete(root,true);}
        }
    }
}
