import pc from 'picocolors';

export function showBanner(version: string): void {
  const C = pc.cyan;
  const Y = pc.yellow;
  const D = pc.dim;
  const W = pc.white;

  const logo = [
    '',
    `              ${Y('(  (  (')}  ${Y('●')}  ${Y(')  )  )')}`,
    '',
    `      ${C('██████╗  ██╗ ███╗   ██╗  ██████╗ ')}`,
    `      ${C('██╔══██╗ ██║ ████╗  ██║ ██╔════╝ ')}`,
    `      ${C('██████╔╝ ██║ ██╔██╗ ██║ ██║  ███╗')}`,
    `      ${C('██╔═══╝  ██║ ██║╚██╗██║ ██║   ██║')}`,
    `      ${C('██║      ██║ ██║ ╚████║ ╚██████╔╝')}`,
    `      ${C('╚═╝      ╚═╝ ╚═╝  ╚═══╝  ╚═════╝ ')}`,
    '',
    `    ${D('──────────────────────────────────────────')}`,
    `    ${W('Never miss a Claude Code moment.')}`,
    `    ${D(`v${version}  ·  Alerts for Claude Code CLI sessions`)}`,
    `    ${D('──────────────────────────────────────────')}`,
    '',
  ];

  console.log(logo.join('\n'));
}
