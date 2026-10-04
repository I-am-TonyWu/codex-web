'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const entries = JSON.parse(fs.readFileSync(path.join(root,'checksums.json'),'utf8').replace(/^\uFEFF/,''));
(async()=>{
  let count = 0, failures = 0;
  for (const item of entries) {
    const relative = item.path.replaceAll('\\','/');
    if (path.isAbsolute(relative) || relative.split('/').some(segment => !segment || segment === '..' || segment === '.' || segment.includes(':'))) throw Error('校验表包含非法路径。');
    const file = path.resolve(root,relative);
    if (!file.toLowerCase().startsWith(root.toLowerCase()+path.sep)) throw Error('校验目标不在迁移包内。');
    try {
      const info = fs.statSync(file);
      if (!info.isFile() || info.size !== item.bytes) throw Error('文件缺失或大小不匹配');
      const hash = crypto.createHash('sha256');
      for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
      if (hash.digest('hex') !== item.sha256) throw Error('SHA256 不匹配');
    } catch(error) { console.error(relative + '：' + error.message); failures++; }
    count++;
    if (count % 2000 === 0) console.log('正在校验：'+count+' / '+entries.length);
  }
  if (failures) throw Error('校验失败：'+failures+' 个文件。');
  console.log('校验通过：'+count+' 个文件。');
})().catch(error=>{console.error(error.message);process.exitCode=1});
