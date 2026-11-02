# Migração para ciclos e passagens

Nenhuma migration foi criada ou aplicada: a especificação condiciona sua elaboração à auditoria do banco real e ao relatório de compatibilidade. Nenhum backfill foi executado.

Após a auditoria, obter backup recuperável por ferramenta oficial apropriada ao projeto, armazená-lo fora do repositório e testar restauração em ambiente separado. Registrar totais, IDs e relações antes/depois sem expor dados pessoais. Testar SQL aditivo em clone com dados representativos, RLS com duas contas, concorrência e repetição de eventos antes de planejar produção. O rollback deve desativar a funcionalidade e preservar histórico e novos eventos; não apagar dados como procedimento padrão.
