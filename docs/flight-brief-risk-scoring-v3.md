# Flight Brief risk scoring v3 (trial)

This model is a decision aid, not an airworthiness, legal-minimum, or go/no-go determination. It follows the FAA FRAT/PAVE idea of reviewing pilot, aircraft, environment, and external pressures, but the weights and bands below are PilotSeal product trial values, not FAA-validated thresholds.

## Inputs

- Student/Pilot and CFI/Co-Pilot each answer six IMSAFE factors, 0/1/2 points per factor.
- The 28 former static/dynamic checkbox factors are now described choices: no concern (0), some concern (base weight), significant concern (twice base weight). The base weights are the former checkbox point values (1, 2, or 3), to keep their relative importance visible while adding severity.
- “Not applicable” is an explicit zero-point answer. An unanswered factor is **not** zero: the overall score remains incomplete. An optional additional named risk has a 0/2/4 scale.
- Sleeping and waking hours and time pressure help the pilots choose IMSAFE answers; they are not automatic safety cutoffs and are not persisted.

## Outcome

Add all factor and IMSAFE points. 0–12 is low risk; 13–24 calls for mitigation; 25+ calls for further review. These bands are preliminary and need scenario-based product-owner validation before release. Every significant concern produces an independent review item even when the aggregate is low. The existing warning for more than two CFI IMSAFE concern areas remains “NO FLIGHT until reviewed and reduced.” Existing weather, fuel, training-maneuver, and NOTAM prompts remain separate from the total.

## Records and privacy

Version 3 persists factor IDs with severity, scores, summary, and generated review items in the existing `brief_data` JSONB. It does not persist health descriptions or sleep/awake context. Finalized older records retain their stored scores; older drafts keep their other data but require re-answering the v3 flight factors. No database migration is required.

## Validation before production release

Review representative helicopter, airplane, student-solo, dual, night, marginal-weather, maintenance, and evaluation scenarios. In particular, validate whether former checkbox weights and the new 12/24 boundaries align with local flight-school policies and personal minimums. Do not infer regulatory compliance from a low score.

References: [FAA FRAT](https://www.faa.gov/general/flight-risk-assessment-tool-frat-faa-safety-team), [FAA Flight Risk Assessment Tools](https://www.faa.gov/sites/faa.gov/files/2022-01/Flight%20Risk%20Assessment%20Tools.pdf), [FAA Personal and Weather Risk Assessment Guide](https://www.faa.gov/sites/faa.gov/files/training_testing/training/fits/guidance/Pers%20Wx%20Risk%20Assessment%20Guide-V1.0.pdf).
