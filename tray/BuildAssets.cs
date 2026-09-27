using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
namespace CodexWebTray {
    internal static class BuildAssets {
        static void Main(string[] args) {
            Directory.CreateDirectory(args[0]);
            int[] sizes = { 16, 24, 32, 48, 64, 128, 256 };
            var images = new List<byte[]>();
            foreach (int size in sizes) using (var image = Icons.Draw(size, Color.FromArgb(96,165,250))) using (var ms = new MemoryStream()) { image.Save(ms, ImageFormat.Png); images.Add(ms.ToArray()); }
            using (var w = new BinaryWriter(File.Create(Path.Combine(args[0], "app.ico")))) {
                w.Write((short)0); w.Write((short)1); w.Write((short)sizes.Length);
                int offset = 6 + 16 * sizes.Length;
                for (int i = 0; i < sizes.Length; i++) {
                    w.Write((byte)(sizes[i] == 256 ? 0 : sizes[i])); w.Write((byte)(sizes[i] == 256 ? 0 : sizes[i])); w.Write((byte)0); w.Write((byte)0);
                    w.Write((short)1); w.Write((short)32); w.Write(images[i].Length); w.Write(offset); offset += images[i].Length;
                }
                foreach (var bytes in images) w.Write(bytes);
            }
            using (var sheet = new Bitmap(640, 150)) using (var g = Graphics.FromImage(sheet)) {
                g.Clear(Color.FromArgb(20,30,47));
                string[] labels = { "WAITING", "RUNNING", "ERROR", "PAUSED" };
                using (var font = new Font("Segoe UI", 10, FontStyle.Bold))
                    for (int i=0;i<4;i++) {
                        using (var icon = Icons.Draw(72, Icons.ColorFor((Lamp)i))) g.DrawImage(icon, 44+i*160, 20);
                        g.DrawString(labels[i], font, Brushes.White, 42+i*160, 112);
                    }
                sheet.Save(Path.Combine(args[0], "tray-states.png"), ImageFormat.Png);
            }
        }
    }
}
