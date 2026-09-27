using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
namespace CodexWebTray {
    internal static class SecurityTests {
        static void Check(bool value,string name) {if(!value)throw new Exception(name);Console.WriteLine("PASS "+name);}
        static void Reject(Action action,string name) {bool fail=false;try{action();}catch{fail=true;}Check(fail,name);}
        [STAThread] static int Main() {
            string root=Path.Combine(Path.GetTempPath(),"codex-security-tests-"+Guid.NewGuid().ToString("N"));
            try {
                Secrets.RegistryPath=@"Software\CodexWebTray\Tests\"+Guid.NewGuid().ToString("N"); Directory.CreateDirectory(root);Secrets.DirectoryPath=Path.Combine(root,"secrets");
                CloudflareSite.FilePath=Path.Combine(root,"site.json");
                Check(CloudflareSite.Load().AccountId==null,"Public build has no configured account");
                Reject(()=>CloudflareSite.Save(new SiteConfiguration()),"Reject incomplete site configuration");
                CloudflareSite.Save(new SiteConfiguration {AccountId=new string('a',32),ApplicationId="11111111-1111-4111-8111-111111111111",PolicyId="22222222-2222-4222-8222-222222222222",Hostname="codex.example.com"});
                Check(CloudflareSite.Load().Hostname=="codex.example.com","Site configuration round trip");
                using(var form=SecurityDialogs.SiteWindow()) {
                    Check(form.Controls.Cast<System.Windows.Forms.Control>().All(c=>c.Bottom<=form.ClientSize.Height && c.Right<=form.ClientSize.Width),"Site controls fit dialog bounds");
                }
                File.WriteAllText(Path.Combine(root,"codexui-password"),"existing-password-123!");
                Check(Secrets.Password(root)=="existing-password-123!","Migrate current password without rotation");
                File.WriteAllText(Path.Combine(root,"codexui-password"),"different-legacy");
                Check(Secrets.Password(root)=="existing-password-123!","Persistent secret wins over stale output file");
                Secrets.Save("web-password","updated-密码-123456!");
                Check(Secrets.Password(root)=="updated-密码-123456!","Custom Unicode password round trip");
                Check(!Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(Secrets.DirectoryPath,"web-password.dat"))).Contains("updated"),"Encrypted secret on disk");
                Secrets.Save("cloudflare-token","test-token");Check(Secrets.Read("cloudflare-token")=="test-token","Independent token storage");
                File.Delete(Path.Combine(Secrets.DirectoryPath,"cloudflare-token.dat"));Check(Secrets.Read("cloudflare-token")=="test-token","Saved token survives missing file after restart"); Secrets.Forget("cloudflare-token");Check(Secrets.Read("cloudflare-token")==null,"Forget local token");
                Secrets.ValidatePassword("12345678");Secrets.ValidatePassword(new string('x',20));Check(true,"Accept 8 and 20 character boundaries");Reject(()=>Secrets.ValidatePassword("1234567"),"Reject 7 characters");Reject(()=>Secrets.ValidatePassword(new string('x',21)),"Reject 21 characters");Reject(()=>Secrets.ValidatePassword("longpassword\n123"),"Reject control characters");
                Check(AccessClient.ParseEmails("alice@example.com\r\nAlice@example.com;bob@example.com").Length==2,"Deduplicate mailbox addresses");
                Reject(()=>AccessClient.ParseEmails("*@gmail.com"),"Reject wildcard");Reject(()=>AccessClient.ParseEmails(""),"Reject empty allow list");
                var p=AccessClient.Json.Deserialize<Dictionary<string,object>>("{\"id\":\""+AccessClient.Policy+"\",\"app_count\":1,\"name\":\"Codex owner only\",\"decision\":\"allow\",\"include\":[{\"email\":{\"email\":\"alice@example.com\"}}],\"require\":[{\"country\":{\"country_code\":\"US\"}}],\"exclude\":[],\"session_duration\":\"12h\"}");
                var body=AccessClient.BuildUpdate(p,new[]{"bob@example.com"},"6h");
                Check(AccessClient.Json.Serialize(body["require"])==AccessClient.Json.Serialize(p["require"])&&!body.ContainsKey("id"),"Preserve other restrictions, strip readonly fields");
                Check((string)p["session_duration"]=="12h","Do not mutate loaded snapshot");
                p["app_count"]=2;Reject(()=>AccessClient.Emails(p),"Reject shared policy");p["app_count"]=1;
                int writes=0;var cloud=p;
                AccessClient.TestTransport=(token,method,path,data)=>{
                    if(path=="apps/"+AccessClient.App+"/policies")return new object[]{new Dictionary<string,object>{{"id",AccessClient.Policy}}};
                    if(method=="PUT"){writes++;cloud=new Dictionary<string,object>((Dictionary<string,object>)data);cloud["id"]=AccessClient.Policy;cloud["app_count"]=1;}
                    return cloud;
                };
                AccessClient.Save("test",p,new[]{"bob@example.com"},"6h");Check(writes==1&&AccessClient.Emails(cloud)[0]=="bob@example.com","Read-update-read verification");
                Reject(()=>AccessClient.Save("test",p,new[]{"carol@example.com"},"1h"),"Reject stale configuration");Check(writes==1,"Conflict does not write");
                AccessClient.TestTransport=null;
                using(var form=SecurityDialogs.PasswordWindow((pvalue,revoke)=>{})) {
                    Check(form.Controls.OfType<System.Windows.Forms.TextBox>().All(x=>x.UseSystemPasswordChar),"Password fields are masked");
                    Check(form.Controls.OfType<System.Windows.Forms.CheckBox>().Single().Checked,"Revoke old sessions defaults on");
                    Check(form.Controls.Cast<System.Windows.Forms.Control>().All(c=>c.Bottom<=form.ClientSize.Height && c.Right<=form.ClientSize.Width),"Controls fit dialog bounds");
                }
                using(var form=SecurityDialogs.AccessWindow()) {
                    Check(form.Controls.OfType<System.Windows.Forms.Label>().Any(x=>x.Text.StartsWith("尚未配置 API Token")),"Missing token prompt is accurate");
                    Check(!form.Controls.OfType<System.Windows.Forms.Button>().Single(x=>x.Text=="保存到 Cloudflare").Enabled,"Cloud save requires successful read");
                    Check(form.Controls.Cast<System.Windows.Forms.Control>().All(c=>c.Bottom<=form.ClientSize.Height && c.Right<=form.ClientSize.Width),"Controls fit dialog bounds");
                }
                Secrets.Save("cloudflare-token","test-token");
                using(var form=SecurityDialogs.AccessWindow()) {
                    Check(form.Controls.OfType<System.Windows.Forms.Label>().Any(x=>x.Text.StartsWith("已加载本机加密保存的令牌")),"Saved token does not show first-use prompt");
                    Check(form.Controls.OfType<System.Windows.Forms.TextBox>().Single(x=>x.UseSystemPasswordChar).Text=="test-token","Saved token populates masked input");
                }
                return 0;
            }catch(Exception ex){Console.WriteLine("FAIL "+ex.Message);return 1;}
            finally{Microsoft.Win32.Registry.CurrentUser.DeleteSubKeyTree(Secrets.RegistryPath,false);AccessClient.TestTransport=null; if(Directory.Exists(root))Directory.Delete(root,true);}
        }
    }
}
