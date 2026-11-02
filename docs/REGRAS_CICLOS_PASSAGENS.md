# Regras atuais e limites

O planejador existente ordena tópicos-folha por atraso de revisão, status, resultados verificados, tempo desde contato e confiança. Os pesos em `src/lib/planner.ts` são regras locais, não o algoritmo proprietário de terceiros. Para dificuldade, usa-se a tentativa verificada mais recente de cada questão classificada por tópico; autoavaliações não entram no escore. Amostras com menos de dez questões distintas são identificadas como insuficientes. A pontuação ainda pode usar essas amostras e não constitui diagnóstico consolidado.

O plano diário respeita disponibilidade, dias bloqueados, limite de revisões e o motor SRS existente. Sessões e status antigos não são convertidos em passagens. Ainda não existem plano persistente, ciclo com cursor, checklist de passagem, associação atômica ou ativação por usuário; a sugestão atual é recalculada e não deve ser confundida com um ciclo persistido.
