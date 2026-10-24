/**
 * Temas de treino AUTORAIS (origem='autoral', official=false). NÃO são temas oficiais da banca.
 * Foco em assuntos navais/nacionais (não específicos de informática), alinhados ao perfil de temas
 * que a Marinha costuma usar (papel da Marinha, mar, soberania, ciência e tecnologia, cidadania).
 * A relevância é uma hipótese de estudo, não previsão de prova.
 */
export interface PromptSeed {
  title: string
  text: string
}

const base = (assunto: string) =>
  `Com base em seus conhecimentos e nos textos de apoio que julgar pertinentes, redija um texto dissertativo-argumentativo sobre o tema "${assunto}". Apresente tese clara, argumentos fundamentados e proposta de intervenção. (Tema autoral de treino — não oficial.)`

export const PROMPTS_AUTORAIS: PromptSeed[] = [
  'A importância da Amazônia Azul para o desenvolvimento do Brasil',
  'A defesa da soberania nacional nos espaços marítimos brasileiros',
  'O papel da Marinha do Brasil na proteção da Amazônia Azul e dos recursos do mar',
  'Como desenvolver a Marinha Mercante e a indústria naval brasileiras',
  'A Marinha e a contribuição para o desenvolvimento científico e tecnológico do país',
  'Economia azul: o mar como vetor de desenvolvimento sustentável do Brasil',
  'Preservação dos oceanos e combate à poluição marinha e à pesca ilegal',
  'O Programa de Desenvolvimento de Submarinos e a autonomia estratégica nacional',
  'Defesa cibernética e soberania digital: desafios para o Estado brasileiro',
  'A Marinha na assistência humanitária e em apoio à população (cheias, resgates, saúde)',
  'A inserção e a valorização das mulheres nas Forças Armadas',
  'Mentalidade marítima: como aproximar a sociedade brasileira do mar',
  'O Brasil e a Antártica: presença científica e interesses estratégicos',
  'A importância das Forças Armadas para a cidadania e a estabilidade democrática',
  'Segurança do tráfego marítimo e dos portos como base do comércio exterior brasileiro',
  'Formação profissional qualificada e o desenvolvimento nacional',
].map((t) => ({ title: t, text: base(t) }))
