import { spawnSync } from 'node:child_process';
import process from 'node:process';

export interface Step {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export const BASE_VERIFY_STEPS: readonly Step[] = [
  {
    name: 'Backend Typecheck & Build (tsc)',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['--prefix', 'sistema/backend', 'run', 'build'],
  },
  {
    name: 'Frontend Lint (oxlint)',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['--prefix', 'sistema/frontend', 'run', 'lint'],
  },
  {
    name: 'Frontend Typecheck & Build (tsc -b && vite build)',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['--prefix', 'sistema/frontend', 'run', 'build'],
  },
];

export function runStep(step: Step): { success: boolean; output: string } {
  console.log('\n⏳ [' + step.name + ']...');
  const start = Date.now();
  const res = spawnSync(step.command, step.args as string[], {
    stdio: 'inherit',
    cwd: step.cwd ?? process.cwd(),
    shell: true,
    env: {
      ...process.env,
      // O caminho global pode estar protegido por ACLs no Windows. Quando o
      // cache temporário existir, os roteiros Playwright usam-no sem exigir
      // configuração manual a cada execução.
      ...(process.env.PLAYWRIGHT_BROWSERS_PATH
        ? {}
        : process.platform === 'win32'
          ? { PLAYWRIGHT_BROWSERS_PATH: `${process.env.TEMP ?? process.cwd()}\\homolog-playwright-browsers` }
          : {}),
    },
  });
  const duration = ((Date.now() - start) / 1000).toFixed(1);

  if (res.status !== 0) {
    console.error('❌ [' + step.name + '] falhou após ' + duration + 's com código ' + res.status);
    return { success: false, output: 'Falha em ' + step.name };
  }

  console.log('✅ [' + step.name + '] passou (' + duration + 's)');
  return { success: true, output: '' };
}

export function runVerify(optionalTestScript?: string): boolean {
  console.log('🚀 Iniciando verificação mecânica do Homologação Mobiltec...\n');

  for (const step of BASE_VERIFY_STEPS) {
    const result = runStep(step);
    if (!result.success) {
      console.error('\n🚫 Verificação interrompida pelo passo anterior.');
      return false;
    }
  }

  if (optionalTestScript && optionalTestScript.trim() !== '') {
    const scriptName = optionalTestScript.startsWith('verificar:')
      ? optionalTestScript
      : 'verificar:' + optionalTestScript;

    const testStep: Step = {
      name: 'Roteiro Playwright (' + scriptName + ')',
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['--prefix', 'sistema/backend', 'run', scriptName],
    };

    const testResult = runStep(testStep);
    if (!testResult.success) {
      console.error('\n🚫 Roteiro Playwright ' + scriptName + ' falhou.');
      return false;
    }
  }

  console.log('\n🎉 Todas as verificações passaram com sucesso!');
  return true;
}
