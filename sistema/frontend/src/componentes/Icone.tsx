/**
 * Ícones do menu e da vitrine.
 *
 * São poucos e desenhados à mão em vez de trazer uma biblioteca inteira: o
 * nome vem do campo `icone` da categoria, que já usa a nomenclatura do Lucide,
 * então trocar por `lucide-react` depois é substituir este arquivo.
 */
export type NomeIcone =
  | 'home'
  | 'credit-card'
  | 'printer'
  | 'scan-barcode'
  | 'smartphone'
  | 'tablet'
  | 'apple'
  | 'painel'
  | 'registro'
  | 'servidor'
  | 'caixa'
  | 'balanca'
  | 'sair'
  | 'busca'
  | 'certificado'
  | 'relogio'
  | 'baixar'
  | 'upload'
  | 'anexo'
  | 'camera'
  | 'x'
  | 'compartilhar'
  | 'whatsapp'
  | 'email'
  | 'ambiente'
  | 'parceiros'
  | 'homologacao'
  | 'sino'
  | 'lixeira'
  | 'lapis'

const TRACADOS: Record<NomeIcone, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  sino: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4.3 13a2 2 0 0 0 3.4 0',
  lixeira: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  lapis: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z M15 5l4 4',
  anexo:
    'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  homologacao:
    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4',
  ambiente: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 11h4a2 2 0 0 1 2 2v8M9 7h2M9 11h2M9 15h2',
  parceiros: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  'credit-card': 'M2.5 6.5h19v11h-19zM2.5 10.5h19M6 14.5h4',
  printer: 'M6.5 9V3.5h11V9M6.5 17.5h-3v-6h17v6h-3M6.5 14h11v6.5h-11z',
  'scan-barcode': 'M3.5 7.5v-4h4M16.5 3.5h4v4M20.5 16.5v4h-4M7.5 20.5h-4v-4M8 8v8M11.5 8v8M15 8v8',
  smartphone: 'M7 2.5h10v19H7zM10.5 18.5h3',
  tablet: 'M5 2.5h14v19H5zM10 18.5h4',
  apple: 'M15.5 3c-1 .2-2 .9-2.4 1.8M16.8 12.6c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8s-1.8-.8-2.9-.8c-1.5 0-2.9.9-3.6 2.2-1.6 2.7-.4 6.7 1.1 8.9.7 1.1 1.6 2.3 2.8 2.2 1.1 0 1.5-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.6-.9.9-1.7 1-2.1-2-.8-2.2-3.9-2.2-4z',
  painel: 'M3.5 4.5h17v15h-17zM9.5 4.5v15',
  registro: 'M4.5 4.5h15v15h-15zM12 8.5v7M8.5 12h7',
  servidor: 'M3.5 4.5h17v6h-17zM3.5 13.5h17v6h-17zM7 7.5h.01M7 16.5h.01',
  caixa: 'M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9',
  balanca: 'M3.5 8.5h17v11h-17zM7.5 8.5V5a4.5 4.5 0 0 1 9 0v3.5M12 12.5v3',
  sair: 'M14.5 16.5v3h-11v-15h11v3M10 12h10.5M17.5 8.5 21 12l-3.5 3.5',
  busca: 'M11 3.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M16.5 16.5 21 21',
  certificado: 'M7 3.5h10v13H7zM9.5 7h5M9.5 10h5M12 16.5v4l-2-1.3-2 1.3',
  relogio: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 7.5V12l3 2',
  baixar: 'M12 3.5v11M8 11l4 4 4-4M4.5 19.5h15',
  upload: 'M12 17.5v-11M8 10.5l4-4 4 4M4.5 19.5h15',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  x: 'M18 6 6 18M6 6l12 12',
  compartilhar:
    'M18 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6',
  whatsapp:
    'M3.5 20.5l1.3-4.7A8 8 0 1 1 8.2 19.2zM8.8 8.2c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.7 1.6c.1.2 0 .4-.1.5l-.4.5c-.1.2-.2.3 0 .6a6 6 0 0 0 2.6 2.3c.3.1.4.1.6-.1l.5-.6c.2-.2.3-.2.5-.1l1.5.8c.2.1.3.2.3.4a1.7 1.7 0 0 1-1.2 1.5c-.4.1-1 .2-3-.7a8 8 0 0 1-3.4-3.3c-.7-1.2-.7-2-.7-2.3a2 2 0 0 1 .4-1.1z',
  email: 'M2.5 6.5h19v11h-19zM2.5 7l9.5 6.5L21.5 7',
}

export function Icone({
  nome,
  className = 'h-4 w-4',
}: {
  nome: NomeIcone
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={TRACADOS[nome]} />
    </svg>
  )
}

/** O `icone` da categoria pode não estar no conjunto — cai num genérico */
export function iconeDaCategoria(icone: string): NomeIcone {
  return (icone in TRACADOS ? icone : 'credit-card') as NomeIcone
}

/**
 * Ícones oferecidos no registro de um tipo de dispositivo.
 *
 * Um recorte do conjunto: os de navegação ('painel', 'sair', 'busca') não
 * descrevem hardware nenhum e só confundiriam a escolha.
 */
export const ICONES_TIPO: { nome: NomeIcone; rotulo: string }[] = [
  { nome: 'credit-card', rotulo: 'Terminal / PoS' },
  { nome: 'printer', rotulo: 'Impressora' },
  { nome: 'scan-barcode', rotulo: 'Coletor / Leitor' },
  { nome: 'smartphone', rotulo: 'Smartphone' },
  { nome: 'tablet', rotulo: 'Tablet' },
  { nome: 'balanca', rotulo: 'Balança' },
  { nome: 'caixa', rotulo: 'Periférico' },
  { nome: 'servidor', rotulo: 'Servidor / Gateway' },
  { nome: 'apple', rotulo: 'iOS' },
  { nome: 'relogio', rotulo: 'Vestível' },
]
