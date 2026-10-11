// Isolated UI fixture: actual Vue components and Skills Hub route, no model calls.
const fs = require('node:fs');
const path = require('node:path');
const home = path.resolve(process.env.SKILLS_FIXTURE_HOME || 'output/skills-directory-fixture');
fs.mkdirSync(home, { recursive: true });
process.env.CODEX_HOME = home;
const configFile = path.join(home, 'enabled.json');
if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, JSON.stringify({ 'personal-drawio': true, 'disabled-skill': false, 'failing-skill': true }));
const personal = ['personal-drawio', 'disabled-skill', 'failing-skill'].map(name => {
 const file = path.join(home, 'skills', name, 'SKILL.md'); fs.mkdirSync(path.dirname(file), { recursive: true });
 fs.writeFileSync(file, `---\nname: ${name}\ndescription: 个人技能说明，可以打开查看完整内容。\n---\n# ${name}\n`);
 return { name, path: file, scope: 'user', description: '个人安装的技能，可启用或停用。' };
});
const events = [];
const writeJson = (res, body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
const skillsRpc = { rpc: async () => {
 const enabled = JSON.parse(fs.readFileSync(configFile, 'utf8'));
 return { data: [{ skills: [...personal.map(skill => ({ ...skill, enabled: enabled[skill.name] })),
 { name: 'system-imagegen', path: path.join(home, 'skills', '.system', 'imagegen', 'SKILL.md'), scope: 'system', enabled: true },
 { name: 'plugin-skill', path: path.join(home, 'plugins', 'cache', 'foo', 'skills', 'foo', 'SKILL.md'), scope: 'user', enabled: true }] }] };
} };
(async () => {
 const { createServer } = await import('vite');
 const vue = (await import('@vitejs/plugin-vue')).default;
 const tailwind = (await import('@tailwindcss/vite')).default;
 let handler;
 const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 4217, strictPort: true }, plugins: [vue(), tailwind(), { name: 'isolated-directory-api', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
   const url = new URL(req.url, 'http://localhost');
   if (url.pathname === '/fixture-state') return writeJson(res, { enabled: JSON.parse(fs.readFileSync(configFile, 'utf8')), events });
   if (!url.pathname.startsWith('/codex-api/')) return next();
   events.push({ method: req.method, path: url.pathname });
   const readJsonBody = async () => { let body = ''; for await (const chunk of req) body += chunk; return JSON.parse(body || '{}'); };
   if (await handler(req, res, url, { appServer: skillsRpc, readJsonBody })) return;
   if (url.pathname === '/codex-api/meta/methods') return writeJson(res, { data: ['plugin/list','plugin/read','plugin/install','plugin/uninstall','app/list','mcpServerStatus/list','skills/config/write'] });
   if (url.pathname === '/codex-api/extensions') return writeJson(res, { plugins: { marketplaces: [{ name: 'local', plugins: [
    { id: 'installed@local', name: 'installed', installed: true, enabled: true, interface: { displayName: '已安装插件' } },
    { id: 'disabled@local', name: 'disabled', installed: true, enabled: false, interface: { displayName: '已停用插件' } },
    { id: 'uninstalled@local', name: 'uninstalled', installed: false, enabled: true, interface: { displayName: '未安装插件' } },
   ] }] }, skills: await skillsRpc.rpc(), syncing: false, syncError: '' });
   if (url.pathname === '/codex-api/rpc') {
    const body = await readJsonBody(); events.push(body);
    if (body.method === 'skills/config/write') {
     if (body.params.path.includes('failing-skill')) return writeJson(res, { error: { code: 'rpc_error', message: '保存失败，请重试' } });
     const skill = personal.find(skill => skill.path === body.params.path);
     if (!skill) return writeJson(res, { error: { message: 'Unknown skill' } });
     const enabled = JSON.parse(fs.readFileSync(configFile, 'utf8')); enabled[skill.name] = body.params.enabled;
     fs.writeFileSync(configFile, JSON.stringify(enabled));
     return writeJson(res, { result: {} });
    }
    if (body.method === 'app/list') return writeJson(res, { result: { data: [{ id: 'github', name: 'GitHub', description: '连接代码仓库', isEnabled: true, isAccessible: true }] } });
    return writeJson(res, { result: { data: [] } });
   }
   return writeJson(res, { data: [] });
  });
 } }] });
 handler = (await server.ssrLoadModule('/src/server/skillsRoutes.ts')).handleSkillsRoutes;
 const output = path.join(process.cwd(), 'output'); fs.mkdirSync(output, { recursive: true });
 fs.writeFileSync(path.join(output, 'skills-directory.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">
 import {createApp} from 'vue';
 import {createRouter,createWebHashHistory} from 'vue-router';
 import DirectoryHub from '/src/components/content/DirectoryHub.vue';
 import {setUiLanguage} from '/src/composables/useUiLanguage.ts';
 import '/src/style.css';
 setUiLanguage('zh-CN');
 document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark');
 document.documentElement.style.fontSize = new URLSearchParams(location.search).get('zoom') === '200' ? '32px' : '16px';
 const router=createRouter({history:createWebHashHistory(),routes:[{path:'/:pathMatch(.*)*',component:DirectoryHub}]});
 createApp(DirectoryHub).use(router).mount('#app');
 </script></body></html>`);
 await server.listen(); console.log('Fixture ready at http://127.0.0.1:4217/output/skills-directory.html');
})().catch(error => { console.error(error); process.exitCode = 1; });
