// Serve actual application components with isolated fixture responses.
(async()=>{
  const {createServer}=await import('vite');
  const vue=(await import('@vitejs/plugin-vue')).default;
  const tailwind=(await import('@tailwindcss/vite')).default;
  const server=await createServer({configFile:false,root:process.cwd(),define:{'import.meta.env.VITE_APP_VERSION':JSON.stringify('1.5.1')},server:{host:'127.0.0.1',port:4218,strictPort:true},plugins:[vue(),tailwind()]});
  await server.listen();console.log('UI fixture: http://127.0.0.1:4218/tests/ui-refresh/fixture.html');
})().catch(error=>{console.error(error);process.exitCode=1});
