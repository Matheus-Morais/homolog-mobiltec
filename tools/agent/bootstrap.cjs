// Node 24 pode falhar em uv_os_get_passwd em ambientes Windows restritos.
// O tsx consulta os.userInfo() durante o bootstrap; o agente não depende
// desses campos, então fornece um fallback seguro antes de carregar o CLI.
const os = require('node:os')

try {
  os.userInfo()
} catch (error) {
  if (error?.code !== 'ENOMEM' && error?.info?.code !== 'ENOMEM') throw error
  const usuario = process.env.USERNAME || process.env.USER || 'codex'
  const diretorioUsuario = process.env.USERPROFILE || process.cwd()
  os.userInfo = () => ({
    username: usuario,
    homedir: diretorioUsuario,
    shell: null,
    uid: -1,
    gid: -1,
  })
}

require('tsx/cjs')
require('./cli.ts')
