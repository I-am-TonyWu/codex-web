using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace CodexWebTray {
    internal sealed class SiteConfiguration {
        public string AccountId { get; set; }
        public string ApplicationId { get; set; }
        public string PolicyId { get; set; }
        public string Hostname { get; set; }
    }
    internal static class CloudflareSite {
        internal static string FilePath = Path.Combine(Paths.Root, "cloudflare-site.json");
        internal static SiteConfiguration Load() {
            if (!File.Exists(FilePath)) return new SiteConfiguration();
            return new JavaScriptSerializer().Deserialize<SiteConfiguration>(File.ReadAllText(FilePath)) ?? new SiteConfiguration();
        }
        internal static void Validate(SiteConfiguration site) {
            Guid app, policy;
            if (site == null || !Regex.IsMatch(site.AccountId ?? "", "\\A[0-9a-fA-F]{32}\\z") ||
                !Guid.TryParse(site.ApplicationId, out app) || !Guid.TryParse(site.PolicyId, out policy) ||
                Uri.CheckHostName(site.Hostname ?? "") != UriHostNameType.Dns)
                throw new ArgumentException("请在“Cloudflare 站点”中填写有效的账户 ID、应用 ID、策略 ID 和域名（不含 https://）。");
        }
        internal static void Save(SiteConfiguration site) {
            Validate(site);
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
            string temp = FilePath + ".tmp";
            File.WriteAllText(temp, new JavaScriptSerializer().Serialize(site));
            if (File.Exists(FilePath)) File.Replace(temp, FilePath, null); else File.Move(temp, FilePath);
        }
    }
}
