const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'web');
const dest = path.join(__dirname, 'payload');
if (fs.existsSync(dest)) throw new Error('Remove or move tray/payload before packaging to avoid stale files.');
fs.mkdirSync(path.join(dest,'app'), {recursive:true});
for(const file of ['dist','dist-cli','package.json','LICENSE']) {
  const src=path.join(root,file);
  if(fs.existsSync(src)) fs.cpSync(src,path.join(dest,'app',file),{recursive:true});
}
const copied = new Set();
function copyDependency(name, parent) {
  let search=parent, source;
  while(true) {
    const candidate=path.join(search,'node_modules',name);
    if(fs.existsSync(path.join(candidate,'package.json'))) { source=candidate; break; }
    const next=path.dirname(search); if(next===search) throw Error('Missing '+name); search=next;
  }
  if(copied.has(source)) return;
  copied.add(source);
  const relative=path.relative(root,source);
  if(relative.startsWith('..')) throw Error('Dependency outside project: '+name);
  fs.cpSync(source,path.join(dest,'app',relative),{recursive:true,filter:p=>{
    const rel=path.relative(source,p).replaceAll('\\','/');
    if(rel==='node_modules'||rel.startsWith('node_modules/')) return false;
    if(name==='node-pty'&&/^prebuilds\/(?!win32-x64(?:\/|$))/.test(rel)) return false;
    return !rel.endsWith('.map');
  }});
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json')));
  for(const child of Object.keys(manifest.dependencies||{})) copyDependency(child,source);
  for(const child of Object.keys(manifest.optionalDependencies||{})) {
    try { copyDependency(child,source); } catch(e) { if(!e.message.startsWith('Missing ')) throw e; }
  }
}
for(const name of ['express','commander','ws','qrcode-terminal','node-pty']) copyDependency(name,root);
fs.copyFileSync(process.execPath,path.join(dest,'node.exe'));
fs.copyFileSync(path.join(__dirname,'bootstrap.cjs'),path.join(dest,'bootstrap.cjs'));
fs.copyFileSync(path.join(__dirname,'NODE-LICENSE.txt'),path.join(dest,'NODE-LICENSE.txt'));
fs.writeFileSync(path.join(dest,'NOTICE.txt'),'codex-web 1.4.3.1 - customized Windows wrapper\nBased on friuns2/codex-mobile 0.1.91 (MIT), Node.js '+process.version+' and runtime dependencies.\nUpstream updater removed; local customizations must be merged and tested manually.\nOriginal licenses are included alongside each component.\nExisting installed OpenAI Codex, account data, and credentials are not bundled.\nGitHub mark: https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png\n');
console.log(JSON.stringify({packages:copied.size,payload:dest}));
