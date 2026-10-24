import type { Topic } from '@/types/db'

/**
 * Sugestão de tópico por palavras-chave no texto OCR.
 * É apenas APOIO à classificação manual: nunca grava nada sozinha e sempre mostra o motivo (termos achados).
 * O OCR é ruidoso; termos curtos usam fronteira de palavra para evitar falsos positivos.
 */
export const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ')

interface MacroDef {
  macro: string // nome exato da macroárea no edital
  keywords: string[]
  leaves?: Record<string, string[]> // nome do tópico-folha (único dentro da macro) -> termos
}

export const KEYWORD_DEFS: MacroDef[] = [
  {
    macro: 'Sistemas Operacionais e Linux',
    keywords: ['sistema operacional', 'kernel', 'linux', 'shell', 'bash', 'thread', 'escalonamento', 'deadlock', 'semaforo', 'mutex', 'memoria virtual', 'paginacao', 'segmentacao', 'swap', 'inode', 'sistema de arquivos', 'ext4', 'chmod', 'chown', 'permissao', 'grep', 'awk', 'systemd', 'microkernel', 'monolitic', 'hipervisor', 'virtualizacao', 'quota', 'syslog', 'fork', 'round robin', 'fcfs', 'sjf', 'pid', 'daemon', 'unix', 'processo filho', 'tlb'],
    leaves: {
      Microkernel: ['microkernel', 'micro-kernel', 'micronucleo'],
      'Monolítica': ['monolitic'],
      'Em camadas': ['arquitetura em camadas do sistema operacional'],
      'Virtualização': ['hipervisor', 'virtualizacao', 'maquina virtual', 'container'],
      Escalonamento: ['escalonamento', 'round robin', 'fcfs', 'sjf', 'quantum'],
      Threads: ['thread'],
      'Sincronização e deadlock': ['deadlock', 'semaforo', 'mutex', 'condicao de corrida', 'inanicao'],
      'Paginação e segmentação': ['paginacao', 'segmentacao', 'tlb', 'lru'],
      'Memória virtual': ['memoria virtual', 'swap', 'thrashing'],
      'Entrada/saída e sistema de arquivos': ['inode', 'sistema de arquivos', 'ext4', 'fat32', 'ntfs', 'journaling'],
      'CLI, shell e regex': ['bash', 'shell', 'grep', 'sed ', 'awk', 'regex', 'expressao regular'],
      'Usuários, grupos e permissões': ['chmod', 'chown', 'permissao', 'umask', '/etc/passwd', 'sudo'],
      Quotas: ['quota'],
      'Serviços e logs': ['systemd', 'syslog', 'journalctl', '/var/log', 'daemon'],
      'Administração de rede': ['ifconfig', 'netstat', 'iptables', 'ip addr', 'resolv.conf'],
    },
  },
  {
    macro: 'Organização e Arquitetura de Computadores',
    keywords: ['complemento de 2', 'complemento a 2', 'hexadecimal', 'binario', 'overflow', 'porta logica', 'portas logicas', 'booleana', 'nand', 'xor', 'cache', 'memoria cache', 'pipeline', 'risc', 'cisc', 'instrucao', 'registrador', 'cpu', 'processador', 'microarquitetura', 'barramento', 'dma', 'paralel', 'multiprocessador', 'flynn', 'simd', 'mimd', 'ula', 'clock', 'endereçamento imediato'],
    leaves: {
      'Bases binária e hexadecimal': ['hexadecimal', 'base 2', 'base 16', 'binario'],
      'Complemento de 2 e overflow': ['complemento de 2', 'complemento a 2', 'overflow'],
      'Álgebra booleana': ['booleana', 'de morgan', 'mapa de karnaugh', 'karnaugh'],
      'Portas lógicas': ['porta logica', 'portas logicas', 'nand', 'nor', 'xor'],
      'Memória e cache': ['cache', 'hit', 'miss', 'mapeamento direto', 'associativa'],
      ISA: ['isa', 'conjunto de instrucoes', 'risc', 'cisc', 'modo de enderecamento'],
      Microarquitetura: ['pipeline', 'hazard', 'superescalar'],
      'Arquiteturas paralelas': ['flynn', 'simd', 'mimd', 'multiprocessador', 'paralelismo'],
    },
  },
  {
    macro: 'Redes de Computadores',
    keywords: ['rede', 'redes', 'osi', 'tcp', 'udp', 'ip ', 'ipv4', 'ipv6', 'dns', 'http', 'https', 'roteamento', 'roteador', 'switch', 'vlan', 'ethernet', 'wi-fi', 'wifi', 'wireless', 'mascara de sub', 'sub-rede', 'sub rede', 'gateway', 'dhcp', 'arp', 'icmp', 'bgp', 'ospf', 'rip', 'nat', 'porta', 'camada de', 'encapsulamento', 'topologia', 'fibra optica', 'par trancado', 'csma', 'lan', 'wan', 'cidr', 'smtp', 'ftp', 'socket'],
    leaves: {
      Encapsulamento: ['encapsulamento', 'pdu'],
      'Camada de enlace': ['enlace', 'ethernet', 'csma', 'quadro', 'mac '],
      'Endereçamento IP': ['ipv4', 'ipv6', 'mascara de sub', 'sub-rede', 'sub rede', 'cidr', 'endereco ip'],
      Roteamento: ['roteamento', 'ospf', 'bgp', 'rip', 'vetor de distancia', 'estado de enlace'],
      Switching: ['switch', 'vlan', 'spanning tree', 'stp'],
      TCP: ['tcp', 'three-way', 'handshake', 'janela deslizante', 'controle de congestionamento'],
      UDP: ['udp', 'datagrama'],
      DNS: ['dns', 'resolvedor', 'registro mx', 'nslookup'],
      HTTP: ['http', 'get ', 'post ', 'cookie', 'status code'],
      'Meios físicos e topologias': ['fibra optica', 'par trancado', 'cabo coaxial', 'topologia', 'estrela', 'barramento'],
      'Redes móveis e sem fio': ['wi-fi', 'wifi', 'wireless', '802.11', 'bluetooth', 'celular', '4g', '5g', 'lte'],
    },
  },
  {
    macro: 'Segurança da Informação',
    keywords: ['seguranca', 'criptografia', 'criptografic', 'hash', 'assinatura digital', 'certificado digital', 'phishing', 'malware', 'ransomware', 'vírus', 'virus', 'trojan', 'cavalo de troia', 'worm', 'botnet', 'ddos', 'firewall', 'ids', 'ips ', 'ipsec', 'vpn', 'autenticacao', 'autorizacao', 'controle de acesso', 'rbac', 'aes', 'rsa', 'sha-', 'md5', 'chave publica', 'chave privada', 'xss', 'sql injection', 'injecao', 'owasp', 'csrf', 'engenharia social', 'confidencialidade', 'integridade', 'disponibilidade', 'pki', 'tls', 'ssl', 'nuvem'],
    leaves: {
      'Códigos maliciosos': ['malware', 'ransomware', 'trojan', 'cavalo de troia', 'worm', 'botnet', 'rootkit', 'spyware'],
      Phishing: ['phishing', 'engenharia social', 'golpe'],
      'Mecanismos de proteção': ['firewall', 'ids', 'ips ', 'antivirus', 'honeypot'],
      IPSec: ['ipsec', 'esp', 'ah '],
      'Segurança na nuvem': ['nuvem', 'cloud', 'iaas', 'paas', 'saas'],
      'Autenticação e controle de acesso': ['autenticacao', 'autorizacao', 'controle de acesso', 'rbac', 'mac ', 'dac', 'kerberos', 'oauth', 'mfa'],
      Simétrica: ['simetrica', 'aes', 'des', 'chave secreta'],
      Assimétrica: ['assimetrica', 'rsa', 'chave publica', 'chave privada', 'diffie', 'ecc'],
      Hash: ['hash', 'sha-', 'md5', 'colisao'],
      'Codificação segura e guias de segurança web': ['xss', 'sql injection', 'injecao', 'owasp', 'csrf', 'validacao de entrada'],
    },
  },
  {
    macro: 'Algoritmos e Estruturas de Dados',
    keywords: ['algoritmo', 'complexidade', 'big-o', 'o(n', 'o(1', 'o(log', 'recursao', 'recursiv', 'pilha', 'fila', 'lista encadeada', 'arvore', 'arvore binaria', 'avl', 'rubro-negra', 'heap', 'tabela hash', 'ordenacao', 'quicksort', 'mergesort', 'bubble', 'busca binaria', 'grafo', 'dijkstra', 'percurso', 'pre-ordem', 'em ordem', 'pos-ordem', 'colisao', 'estrutura de dados', 'insertion', 'selection'],
    leaves: {
      Recursão: ['recursao', 'recursiv'],
      'Análise de complexidade (Big-O)': ['complexidade', 'big-o', 'o(n', 'o(1', 'o(log', 'assintotic'],
      Busca: ['busca binaria', 'busca sequencial', 'busca linear'],
      Ordenação: ['ordenacao', 'quicksort', 'mergesort', 'bubble', 'insertion', 'selection', 'shellsort', 'heapsort'],
      Pilhas: ['pilha', 'lifo', 'push', 'pop'],
      Filas: ['fila', 'fifo', 'enqueue', 'dequeue'],
      Listas: ['lista encadeada', 'lista ligada', 'lista duplamente'],
      'Árvores binárias': ['arvore binaria', 'pre-ordem', 'pos-ordem', 'em ordem', 'bst', 'arvore de busca'],
      'Árvores balanceadas': ['avl', 'rubro-negra', 'rotacao', 'arvore b', 'balanceamento'],
      Heap: ['heap', 'fila de prioridade'],
      'Tabelas hash': ['tabela hash', 'colisao', 'enderecamento aberto', 'encadeamento'],
      'Processamento de cadeias': ['cadeia', 'string', 'kmp', 'boyer', 'trie', 'casamento de padroes'],
    },
  },
  {
    macro: 'Linguagens de Programação',
    keywords: ['java', 'python', 'classe', 'objeto', 'heranca', 'polimorfismo', 'interface', 'generics', 'stream', 'lambda', 'thread', 'exception', 'excecao', 'try', 'catch', 'public static', 'import ', 'def ', 'lista', 'dicionario', 'tupla', 'escopo', 'tipagem', 'compilador', 'interpretador', 'lexic', 'sintatic', 'gramatica', 'linguagem', 'serializable', 'collection', 'hashmap', 'arraylist', 'string ', 'int ', 'void'],
    leaves: {
      'Sintaxe e semântica': ['sintaxe', 'semantica', 'gramatica', 'bnf'],
      'Análise léxica e sintática': ['lexic', 'sintatic', 'token', 'parser', 'automato'],
      'Escopo e tipos': ['escopo', 'tipagem', 'tipo de dado', 'tipo estatico'],
      'Controle de fluxo': ['laco', 'loop', 'while', 'for ', 'switch', 'break', 'continue'],
      'Orientação a objetos': ['heranca', 'polimorfismo', 'encapsulamento', 'abstrata', 'sobrecarga'],
      Concorrência: ['concorrencia', 'thread', 'synchronized', 'runnable'],
      Exceções: ['exception', 'excecao', 'try', 'catch', 'finally', 'throws'],
      Classes: ['classe', 'construtor', 'static', 'serializable'],
      Streams: ['stream', 'lambda', 'map(', 'filter(', 'collect('],
      'Coleções': ['collection', 'arraylist', 'hashmap', 'hashset', 'treemap', 'linkedlist'],
      Generics: ['generics', 'generico', '<t>'],
      Multithreading: ['multithread', 'executorservice', 'thread', 'synchronized', 'volatile'],
      'Tipos e coleções': ['dicionario', 'tupla', 'set(', 'list(', 'dict'],
      'Funções': ['def ', 'lambda', 'args', 'kwargs', 'decorador'],
      POO: ['__init__', 'self', 'classe', 'heranca'],
    },
  },
  {
    macro: 'Engenharia de Software',
    keywords: ['engenharia de software', 'scrum', 'agil', 'xp ', 'kanban', 'requisito', 'uml', 'diagrama de', 'caso de uso', 'padrao de projeto', 'design pattern', 'singleton', 'factory', 'observer', 'strategy', 'decorator', 'teste', 'tdd', 'qualidade', 'cmmi', 'mps', 'soa', 'servico', 'microsservico', 'rup', 'cascata', 'espiral', 'refatoracao', 'sprint', 'backlog', 'solid', 'acoplamento', 'coesao'],
    leaves: {
      'Processos e métodos ágeis': ['scrum', 'agil', 'xp ', 'kanban', 'sprint', 'backlog', 'cascata', 'espiral', 'rup'],
      Requisitos: ['requisito', 'elicitacao', 'rastreabilidade'],
      UML: ['uml', 'diagrama de', 'caso de uso'],
      'Padrões de projeto': ['padrao de projeto', 'design pattern', 'singleton', 'factory', 'observer', 'strategy', 'decorator', 'adapter'],
      'Testes e qualidade': ['teste', 'tdd', 'qualidade', 'cmmi', 'mps', 'caixa preta', 'caixa branca'],
      'Arquitetura orientada a serviços': ['soa', 'servico web', 'microsservico', 'rest', 'soap', 'esb'],
    },
  },
  {
    macro: 'Gerência de Projetos',
    keywords: ['projeto', 'pmbok', 'pmo', 'escritorio de gerenciamento', 'escopo', 'cronograma', 'custo', 'risco', 'stakeholder', 'parte interessada', 'eap', 'wbs', 'caminho critico', 'pert', 'cpm', 'valor agregado', 'evm', 'termo de abertura', 'estrutura organizacional', 'matricial', 'funcional', 'gerente de projetos', 'grupo de processos', 'heldman', 'comunicacao', 'equipe'],
    leaves: {
      'PMBOK: ciclo de vida e grupos de processos': ['pmbok', 'ciclo de vida', 'grupo de processos', 'iniciacao', 'encerramento', 'termo de abertura'],
      Escopo: ['escopo', 'eap', 'wbs'],
      Cronograma: ['cronograma', 'caminho critico', 'pert', 'cpm', 'folga'],
      Custos: ['custo', 'valor agregado', 'evm', 'orcamento'],
      'Comunicação': ['comunicacao', 'canais de comunicacao'],
      Riscos: ['risco', 'mitigar', 'transferir', 'aceitar'],
      Equipe: ['equipe', 'recursos humanos', 'tuckman', 'motivacao'],
      'Estruturas organizacionais': ['estrutura organizacional', 'matricial', 'funcional', 'projetizada', 'pmo', 'escritorio de gerenciamento'],
    },
  },
  {
    macro: 'Banco de Dados, BI e DW',
    keywords: ['banco de dados', 'sql', 'select', 'join', 'chave primaria', 'chave estrangeira', 'normalizacao', 'forma normal', '1fn', '2fn', '3fn', 'fnbc', 'mer', 'entidade', 'relacionamento', 'transacao', 'acid', 'commit', 'rollback', 'bloqueio', 'serializ', 'indice', 'sgbd', 'data warehouse', 'datawarehouse', 'data mart', 'olap', 'etl', 'dimensao', 'fato', 'star schema', 'flocos de neve', 'bi ', 'business intelligence', 'mineracao', 'nosql', 'dbms'],
    leaves: {
      MER: ['mer', 'entidade', 'relacionamento', 'cardinalidade', 'diagrama entidade'],
      'Modelo relacional e SQL': ['sql', 'select', 'join', 'chave primaria', 'chave estrangeira', 'group by', 'algebra relacional'],
      'Normalização': ['normalizacao', 'forma normal', '1fn', '2fn', '3fn', 'fnbc', 'dependencia funcional'],
      'Concorrência': ['bloqueio', 'lock', '2pl', 'serializ', 'timestamp', 'transacao concorrente'],
      'Recuperação': ['recuperacao', 'log', 'checkpoint', 'undo', 'redo'],
      'Segurança e distribuição': ['fragmentacao', 'replicacao', 'banco distribuido', 'grant', 'revoke'],
      'Bancos espaciais e temporais': ['espacial', 'temporal', 'postgis', 'geografic'],
      'Governança de dados': ['governanca de dados', 'dama', 'dmbok', 'qualidade de dados'],
      'Business Intelligence': ['business intelligence', 'bi ', 'dashboard', 'kpi'],
      'Modelagem dimensional': ['dimensao', 'fato', 'star schema', 'flocos de neve', 'snowflake'],
      ETL: ['etl', 'extracao', 'carga'],
      OLAP: ['olap', 'rollup', 'drill', 'slice', 'dice', 'cubo'],
      'Mineração de dados': ['mineracao', 'data mining', 'kdd'],
    },
  },
  {
    macro: 'Big Data',
    keywords: ['big data', 'hadoop', 'mapreduce', 'spark', 'hdfs', 'hive', 'kafka', 'nosql', 'mongodb', 'cassandra', 'volume', 'variedade', 'velocidade', 'veracidade', 'processamento distribuido', 'cluster', 'data lake', 'streaming', 'yarn', 'hbase'],
    leaves: {
      Fundamentos: ['5 v', 'volume', 'variedade', 'velocidade', 'veracidade'],
      'Processamento distribuído': ['mapreduce', 'spark', 'hdfs', 'yarn', 'cluster', 'distribuido'],
      Tecnologias: ['hadoop', 'hive', 'kafka', 'hbase', 'mongodb', 'cassandra', 'nosql'],
    },
  },
  {
    macro: 'Inteligência Artificial e Mineração de Dados',
    keywords: ['inteligencia artificial', 'aprendizado', 'machine learning', 'supervisionado', 'regressao', 'gradiente', 'svm', 'arvore de decisao', 'entropia', 'ganho de informacao', 'acuracia', 'precisao', 'revocacao', 'recall', 'f1', 'matriz de confusao', 'curva roc', 'overfitting', 'k-means', 'kmeans', 'clusteriz', 'pca', 'rede neural', 'naive bayes', 'knn', 'tf-idf', 'tfidf', 'classificacao'],
    leaves: {
      'Regressão': ['regressao'],
      'Gradiente descendente': ['gradiente', 'taxa de aprendizado'],
      SVM: ['svm', 'vetores de suporte', 'margem'],
      'Árvores de decisão e entropia': ['arvore de decisao', 'entropia', 'ganho de informacao', 'gini'],
      'Aprendizado não supervisionado': ['nao supervisionado', 'k-means', 'kmeans', 'clusteriz', 'agrupamento'],
      'Métricas de avaliação': ['acuracia', 'precisao', 'revocacao', 'recall', 'f1', 'matriz de confusao', 'roc', 'overfitting'],
      'Classificação de textos e recuperação de informação': ['tf-idf', 'tfidf', 'recuperacao de informacao', 'bag of words', 'naive bayes', 'stemming'],
      'Redução de dimensionalidade': ['pca', 'dimensionalidade', 'componentes principais'],
    },
  },
  {
    macro: 'Governança de TI',
    keywords: ['governanca', 'cobit', 'itil', 'iso 20000', 'iso 38500', 'gestao de servicos', 'catalogo de servicos', 'sla', 'incidente', 'problema', 'mudanca', 'service desk', 'valor de ti', 'alinhamento estrategico', 'cmmi', 'mps.br', 'togaf', 'bsc', 'balanced scorecard'],
    leaves: {
      'Papéis e modelos de governança': ['governanca', 'iso 38500', 'alinhamento estrategico', 'papeis'],
      'Gestão de serviços e processos': ['itil', 'iso 20000', 'gestao de servicos', 'incidente', 'service desk', 'sla', 'catalogo de servicos'],
      'Frameworks de referência': ['cobit', 'togaf', 'cmmi', 'mps.br', 'bsc'],
    },
  },
  {
    macro: 'Redação',
    keywords: ['redacao', 'dissertativo', 'tese', 'coesao textual', 'coerencia', 'argumento'],
  },
]

/** Termo curto/simbólico casa só como palavra inteira (evita "ip" dentro de "tipo"). */
function hit(text: string, term: string): boolean {
  const t = normalize(term).trim()
  if (!t) return false
  if (t.length <= 4 && /^[a-z0-9]+$/.test(t)) return new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`).test(text)
  return text.includes(t)
}

export interface TopicSuggestion {
  topicId: string
  name: string
  score: number
  hits: string[]
  kind: 'macro' | 'folha'
}

export function suggestTopics(rawText: string | null | undefined, topics: Topic[]): TopicSuggestion[] {
  if (!rawText || rawText.trim().length < 20) return []
  const text = normalize(rawText)
  const byParent = new Map<string | null, Topic[]>()
  for (const t of topics) byParent.set(t.parent_id, [...(byParent.get(t.parent_id) ?? []), t])
  const roots = byParent.get(null) ?? []
  const leavesOf = (t: Topic): Topic[] => {
    const c = byParent.get(t.id)
    return c?.length ? c.flatMap(leavesOf) : [t]
  }
  const out: TopicSuggestion[] = []
  for (const def of KEYWORD_DEFS) {
    const root = roots.find((r) => r.name === def.macro)
    if (!root) continue
    const macroHits = [...new Set(def.keywords.filter((k) => hit(text, k)))]
    if (macroHits.length) out.push({ topicId: root.id, name: root.name, score: macroHits.length, hits: macroHits, kind: 'macro' })
    const leaves = leavesOf(root)
    const nameCount = new Map<string, number>()
    for (const l of leaves) nameCount.set(l.name, (nameCount.get(l.name) ?? 0) + 1)
    for (const [leafName, terms] of Object.entries(def.leaves ?? {})) {
      if ((nameCount.get(leafName) ?? 0) !== 1) continue // nome ambíguo ou inexistente: não sugere
      const leaf = leaves.find((l) => l.name === leafName)!
      const h = [...new Set(terms.filter((k) => hit(text, k)))]
      if (h.length) out.push({ topicId: leaf.id, name: leaf.name, score: h.length * 1.5, hits: h, kind: 'folha' })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Macroárea (id) de cada tópico, para agrupar a sugestão. */
export function rootIdOf(topics: Topic[]): (id: string) => string | null {
  const m = new Map(topics.map((t) => [t.id, t]))
  return (id) => {
    let t = m.get(id)
    while (t?.parent_id) t = m.get(t.parent_id)
    return t?.id ?? null
  }
}
