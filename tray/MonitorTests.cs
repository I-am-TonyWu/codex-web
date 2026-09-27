using System;
namespace CodexWebTray {
    internal sealed class FakeRuntime : IServiceRuntime {
        internal bool Desktop, Running, Health = true, FailStart;
        internal int Starts, Stops;
        public bool DesktopRunning() { return Desktop; }
        public bool ServiceRunning { get { return Running; } }
        public void Start() { Starts++; if(FailStart) throw new Exception("Port occupied"); Running = true; }
        public void Stop() { if(Running) Stops++; Running = false; }
        public bool Healthy() { return Health; }
    }
    internal static class MonitorTests {
        static int passed;
        static void Check(bool ok, string name) { if(!ok) throw new Exception("FAIL: " + name); passed++; Console.WriteLine("PASS: " + name); }
        static int Main() {
            try {
                var r = new FakeRuntime(); var m = new Monitor(r); var now = DateTime.UtcNow;
                m.Tick(now); Check(m.State==Lamp.Waiting && r.Starts==0, "Codex absent: yellow and no service start");
                r.Desktop=true; m.Tick(now); Check(m.State==Lamp.Healthy && r.Starts==1, "Codex appears: automatic start and green");
                for(int i=0;i<20;i++) m.Tick(now.AddSeconds(i*3));
                Check(r.Starts==1, "Stable health never starts duplicate services");
                m.Enabled=false; m.Tick(now); Check(m.State==Lamp.Paused && !r.Running, "Manual stop: gray and process stopped");
                m.Tick(now.AddSeconds(100)); Check(r.Starts==1, "Manual pause persists across monitoring ticks");
                m.Enabled=true; m.Retry(); m.Tick(now); Check(m.State==Lamp.Healthy && r.Starts==2, "Enable resumes automatic management");
                r.Desktop=false; m.Tick(now); Check(m.State==Lamp.Waiting && !r.Running, "Codex exits: stop owned backend and wait");
                r.Desktop=true; r.FailStart=true; m.Tick(now); Check(m.State==Lamp.Error && !r.Running, "Launch failure: red");
                int starts=r.Starts; m.Tick(now.AddSeconds(3)); Check(r.Starts==starts, "Failed launch backs off instead of thrashing");
                r.FailStart=false; m.Tick(now.AddSeconds(31)); Check(m.State==Lamp.Healthy, "Automatic recovery after retry delay");
                r.Health=false; m.Tick(now); Check(m.State==Lamp.Error && r.Running, "One unhealthy probe does not kill active jobs");
                r.Health=true; m.Tick(now); Check(m.State==Lamp.Healthy, "Transient health failure recovers without restart");
                r.Health=false; for(int i=0;i<5;i++) m.Tick(now.AddSeconds(i*3));
                Check(!r.Running && m.State==Lamp.Error, "Five consecutive failures stop only owned runtime");
                r.Health=true; m.Tick(now.AddSeconds(60)); Check(m.State==Lamp.Healthy, "Unhealthy runtime restarts after backoff");
                r.Running=false; m.Tick(now.AddSeconds(63)); Check(r.Running && m.State==Lamp.Healthy, "Crashed runtime is automatically restarted");
                Check(DesktopIdentity.Matches("ChatGPT", @"C:\Program Files\WindowsApps\OpenAI.Codex_26.917.8451.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe"), "Actual Windows Store Codex desktop recognized");
                Check(!DesktopIdentity.Matches("codex", @"C:\Users\test\AppData\Local\OpenAI\Codex\bin\abcdef\codex.exe"), "Own Codex CLI is excluded");
                Check(!DesktopIdentity.Matches("ChatGPT", @"C:\Program Files\WindowsApps\OpenAI.ChatGPT_1.0\app\ChatGPT.exe"), "Unrelated ChatGPT app is excluded");
                Check(!DesktopIdentity.Matches("Codex", @"C:\Other\Codex.exe"), "Unrelated executable name is excluded");
                Console.WriteLine("TOTAL " + passed + " passed"); return 0;
            } catch(Exception ex) { Console.Error.WriteLine(ex); return 1; }
        }
    }
}
