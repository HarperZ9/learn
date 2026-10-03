# Misconception diagnosis

When you get an arithmetic practice question wrong, the tutor can say why. It walks a small tree of yes-or-no questions about your answer, one level at a time, and records each question and its answer. The result names a cause you can act on, such as "added the numerators and the denominators" or "no answer given", in place of a bare "wrong".

The diagnosis reads only your prompt and your answer. It never shows a worked solution.

## The tree

The top level splits a wrong answer by cause.

- **missing**: the skill was not applied at all.
  - `missing.no_attempt`: blank, "?", "I don't know" or similar.
  - `missing.unexplained`: a number no rule below explains.
- **misrecruited**: a real procedure, applied where it does not belong.
  - `misrecruited.wrong_operation`: the answer is what another operation gives on the same numbers, such as adding when the question multiplies.
  - `misrecruited.smaller_from_larger`: in subtraction, each column takes the smaller digit from the larger one, whichever is on top.
  - `misrecruited.no_carry`: in addition, each column keeps its last digit and drops the carry.
  - `misrecruited.fraction_add_across`: for a/b + c/d, the answer is (a+c)/(b+d).
- **slip**: the right procedure with a small execution error.
  - `slip.one_digit`: the answer has the right number of digits and differs from the correct answer in exactly one digit, or swaps two adjacent digits.

Questions are asked in this order: no attempt, fraction add-across, smaller-from-larger, no carry, wrong operation, one-digit slip, then unexplained.

## Bar, set before the run

This bar was committed before the diagnoser was written and before its author saw any labelled answer.

**Labels.** 70 recorded wrong answers to whole-number and fraction questions, each with a teacher label from the tree above, written by a separate labeller who saw only this tree. The first 20 by id are a dev set for debugging; the bar is scored on the other 50.

- **D1, leaf agreement.** The diagnosis matches the teacher's leaf label on at least 80% of the 50 test answers.
- **D2, top-level agreement.** The top level (missing, misrecruited, slip) matches on at least 85%.
- **Control.** With each student answer moved to a different question (a seeded derangement), leaf agreement must fall below 50%. If it does not, the diagnoser is reading something other than the answer.
- **Ship rule.** The diagnosis ships whatever the result, with the numbers below.

## Results

Pending the run.
