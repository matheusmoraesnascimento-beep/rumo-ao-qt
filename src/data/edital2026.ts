/**
 * Base PROVISÓRIA: agrupamento pedagógico do programa de Informática do edital CP-T/2026
 * (Anexo de Informática). NÃO é transcrição integral nem promessa de cobrança em 2027.
 * Conferir/ampliar com o anexo oficial. Pesos históricos: desconhecidos (não fabricar).
 */
export interface TopicNode {
  name: string
  children?: TopicNode[]
}

const leaf = (...names: string[]): TopicNode[] => names.map((name) => ({ name }))

export const SYLLABUS_META = {
  year: 2026,
  label: 'CP-T/2026 (base provisória)',
  status: 'provisorio' as const,
  sourceUrl: 'https://www.inscricao.marinha.mil.br/marinha/Edital%20CP-T%202026-005.pdf?id_file=9582',
}

export const EDITAL_2026: TopicNode[] = [
  {
    name: 'Sistemas Operacionais e Linux',
    children: [
      { name: 'Arquiteturas de SO', children: leaf('Monolítica', 'Em camadas', 'Microkernel', 'Virtualização') },
      { name: 'Processos e threads', children: leaf('Processos', 'Threads', 'Escalonamento', 'Sincronização e deadlock') },
      { name: 'Gerência de memória', children: leaf('Paginação e segmentação', 'Memória virtual') },
      { name: 'Entrada/saída e sistema de arquivos' },
      {
        name: 'Linux',
        children: leaf('CLI, shell e regex', 'Usuários, grupos e permissões', 'Processos', 'Quotas', 'Serviços e logs', 'Administração de rede'),
      },
    ],
  },
  {
    name: 'Organização e Arquitetura de Computadores',
    children: [
      { name: 'Representação numérica', children: leaf('Bases binária e hexadecimal', 'Complemento de 2 e overflow') },
      { name: 'Lógica digital', children: leaf('Álgebra booleana', 'Portas lógicas') },
      { name: 'Memória e cache' },
      { name: 'Processadores', children: leaf('Microarquitetura', 'ISA') },
      { name: 'Entrada/saída' },
      { name: 'Arquiteturas paralelas' },
    ],
  },
  {
    name: 'Redes de Computadores',
    children: [
      { name: 'Modelos OSI e TCP/IP', children: leaf('Encapsulamento') },
      { name: 'Camada de enlace' },
      { name: 'Camada de rede', children: leaf('Endereçamento IP', 'Roteamento', 'Switching') },
      { name: 'Camada de transporte', children: leaf('TCP', 'UDP') },
      { name: 'Camada de aplicação', children: leaf('DNS', 'HTTP') },
      { name: 'Meios físicos e topologias' },
      { name: 'Redes móveis e sem fio' },
    ],
  },
  {
    name: 'Segurança da Informação',
    children: [
      { name: 'Ameaças e golpes', children: leaf('Códigos maliciosos', 'Phishing') },
      { name: 'Segurança de redes', children: leaf('Mecanismos de proteção', 'IPSec', 'Segurança na nuvem') },
      { name: 'Autenticação e controle de acesso' },
      { name: 'Criptografia', children: leaf('Simétrica', 'Assimétrica', 'Hash') },
      { name: 'Codificação segura e guias de segurança web' },
    ],
  },
  {
    name: 'Algoritmos e Estruturas de Dados',
    children: [
      { name: 'Recursão' },
      { name: 'Análise de complexidade (Big-O)' },
      { name: 'Busca' },
      { name: 'Ordenação' },
      { name: 'Estruturas lineares', children: leaf('Pilhas', 'Filas', 'Listas') },
      { name: 'Árvores', children: leaf('Árvores binárias', 'Árvores balanceadas', 'Heap') },
      { name: 'Tabelas hash' },
      { name: 'Processamento de cadeias' },
    ],
  },
  {
    name: 'Linguagens de Programação',
    children: [
      { name: 'Conceitos de linguagens', children: leaf('Sintaxe e semântica', 'Análise léxica e sintática', 'Escopo e tipos', 'Controle de fluxo', 'Orientação a objetos', 'Concorrência', 'Exceções') },
      { name: 'Java', children: leaf('Classes', 'Streams', 'Coleções', 'Generics', 'Multithreading') },
      { name: 'Python 3', children: leaf('Tipos e coleções', 'Funções', 'POO') },
    ],
  },
  {
    name: 'Engenharia de Software',
    children: [
      { name: 'Processos e métodos ágeis' },
      { name: 'Requisitos' },
      { name: 'UML' },
      { name: 'Orientação a objetos' },
      { name: 'Padrões de projeto' },
      { name: 'Testes e qualidade' },
      { name: 'Arquitetura orientada a serviços' },
    ],
  },
  {
    name: 'Gerência de Projetos',
    children: [
      { name: 'PMBOK: ciclo de vida e grupos de processos' },
      { name: 'Escopo' },
      { name: 'Cronograma' },
      { name: 'Custos' },
      { name: 'Comunicação' },
      { name: 'Riscos' },
      { name: 'Equipe' },
      { name: 'Estruturas organizacionais' },
    ],
  },
  {
    name: 'Banco de Dados, BI e DW',
    children: [
      { name: 'Modelagem', children: leaf('MER', 'Modelo relacional e SQL', 'Normalização') },
      { name: 'Transações', children: leaf('Concorrência', 'Recuperação') },
      { name: 'Segurança e distribuição' },
      { name: 'Bancos espaciais e temporais' },
      { name: 'Governança de dados' },
      { name: 'Business Intelligence' },
      { name: 'Data Warehouse e Data Mart', children: leaf('Modelagem dimensional', 'ETL', 'OLAP', 'Mineração de dados') },
    ],
  },
  {
    name: 'Big Data',
    children: [
      { name: 'Fundamentos' },
      { name: 'Processamento distribuído' },
      { name: 'Tecnologias' },
      { name: 'Gestão, analítica e implementação' },
    ],
  },
  {
    name: 'Inteligência Artificial e Mineração de Dados',
    children: [
      { name: 'Aprendizado supervisionado', children: leaf('Regressão', 'Gradiente descendente', 'SVM', 'Árvores de decisão e entropia') },
      { name: 'Aprendizado não supervisionado' },
      { name: 'Métricas de avaliação' },
      { name: 'Classificação de textos e recuperação de informação' },
      { name: 'Redução de dimensionalidade' },
    ],
  },
  {
    name: 'Governança de TI',
    children: [
      { name: 'Papéis e modelos de governança' },
      { name: 'Gestão de serviços e processos' },
      { name: 'Frameworks de referência' },
    ],
  },
  {
    name: 'Redação',
    children: [
      { name: 'Argumentação e construção de tese' },
      { name: 'Estrutura textual' },
      { name: 'Coesão e coerência' },
      { name: 'Escrita formal e revisão' },
      { name: 'Controle de tempo' },
    ],
  },
]

export interface FlatTopic {
  slug: string
  name: string
  parentSlug: string | null
  ordinal: number
  depth: number
  macroSlug: string
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Achata a árvore com slugs hierárquicos únicos (macro/assunto/subassunto). */
export function flattenSyllabus(tree: TopicNode[] = EDITAL_2026): FlatTopic[] {
  const out: FlatTopic[] = []
  const walk = (nodes: TopicNode[], parent: string | null, depth: number, macro: string | null) => {
    nodes.forEach((n, i) => {
      const slug = parent ? `${parent}/${slugify(n.name)}` : slugify(n.name)
      const macroSlug = macro ?? slug
      out.push({ slug, name: n.name, parentSlug: parent, ordinal: i, depth, macroSlug })
      if (n.children) walk(n.children, slug, depth + 1, macroSlug)
    })
  }
  walk(tree, null, 0, null)
  return out
}
