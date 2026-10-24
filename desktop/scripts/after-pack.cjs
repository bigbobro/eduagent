// electron-builder 的 extraResources 会硬过滤掉任何名为 node_modules 的目录(filter 也绕不过),
// 所以 server 的 node_modules 在打包后由这个 hook 原样拷进 Resources/server。
const { cpSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  const resources = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents/Resources');
  const from = join(context.packager.projectDir, 'desktop/build/server/node_modules');
  cpSync(from, join(resources, 'server/node_modules'), { recursive: true });
  console.log(`  • afterPack: copied server/node_modules -> ${resources}`);
};
