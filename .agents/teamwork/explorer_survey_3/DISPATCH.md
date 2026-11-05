## 2026-11-05T00:37:49Z
Task Description:
1. Deep-dive into the Intelligent Stock Deduction by Value module (Módulo de Baixa Inteligente por Valor):
   - Input: Valor Alvo (Target Value R$), Forma de Pagamento (Cartão ou Dinheiro), Data do lançamento (default today, allows retroactive selection).
   - Matching Strategy 1: Exact single-product multiple (`(Qtd_sugerida * Unitário) == Valor Alvo` with `1 <= Qtd_sugerida <= Qtd_disponivel`).
   - Matching Strategy 2: Exact multi-product combination (if no single product matches, find an exact combination from available stock that sums up to target value, bounded subset sum / coin change).
   - Matching Strategy 3: Nearest combination / proximity match (if no exact combination exists within reasonable search space, find combination with minimal delta `|soma - alvo|` with `soma <= alvo` or closest possible).
   - Fallback / Assisted Selection: Ranked proximity list of products ordered by proximity of `Unitário` to `Valor Alvo` for operator selection.
   - Operator Confirmation UI data: Código, Barras, Discriminação, Qtd a Debitar, Unitário, Valor Total.
2. Deep-dive into Atomic Transaction & Audit Logging:
   - Atomic DB transaction: decrement product stock `Qtd = Qtd - Qtd_debitada`.
   - Zero-balance handling: flag product as out of stock (`ativo/disponivel = false` or `Qtd = 0`), prevent negative quantity constraint.
   - Financial entry: insert immediate entry into `lancamentos_diarios` in column `cartao` or `dinheiro`.
   - Audit trail: record detailed row in `historico_baixas` with timestamp, product ID, description, quantity deducted, unit value, total value, payment method, linked transaction ID.
3. Deep-dive into Financial Precision and Dashboard:
   - Currency representation: store all amounts in integer cents (centavos) or use strict Decimal representation to eliminate binary floating-point errors (e.g. `0.1 + 0.2 = 0.30000000000000004`).
   - Daily view: Totals separated into Card, Cash, and Daily Total (`Total = Cartão + Dinheiro`).
   - Monthly view: Cumulative sum of Card, Cash, Total Entries, confrontation with Monthly Expenses/Outflows.
4. Document all findings in survey_algorithm_finance.md inside your working directory.
5. Create handoff.md according to the Handoff Protocol.
6. Send a message to the orchestrator when finished.
