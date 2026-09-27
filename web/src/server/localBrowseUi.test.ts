import { expect,it } from 'vitest'
import { decodeBrowsePath,createDirectoryListingHtml } from './localBrowseUi'
import { mkdtemp,writeFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
it('normalizes Windows paths without double decoding Express parameters',()=>{
 expect(decodeBrowsePath('/C:/test%20file.txt')).toBe('C:/test file.txt')
 expect(decodeBrowsePath('/C:/literal%23.txt',true)).toBe('C:/literal%23.txt')
 expect(decodeBrowsePath('/home/test%20file.txt')).toBe('/home/test file.txt')
})
it('provides distinct inline and download links for special filenames',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-browse-test-'))
 try {
  await writeFile(join(dir,'100%23 # 中文.txt'),'TestChat')
  const html=await createDirectoryListingHtml(dir)
  expect(html).toContain('100%2523%20%23%20%E4%B8%AD%E6%96%87.txt?download=1')
  expect(html).toContain('下载</a>')
 } finally {await rm(dir,{recursive:true,force:true})}
})
