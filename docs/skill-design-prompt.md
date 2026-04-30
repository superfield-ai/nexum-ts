# Prompt: Design a Skill with Bayesian Three-Question Clarification

Use this prompt when you need to design a new Claude Code skill (a reusable `.md` agent definition invoked via the `Skill` tool). The skill you are designing must gather requirements from the user in exactly three turns of yes/no questions before producing any output, using Bayesian reasoning to maximize information gained per question.

---

## Your Task

You are designing a Claude Code skill. Before writing a single line of the skill, you must first deeply understand what it needs to do. You will gather that understanding by asking the user three yes/no questions — one per turn, each one sentence, each chosen to maximally reduce your remaining uncertainty given everything you already know.

---

## Phase 1: Map the Decision Space (Do This Before Asking Anything)

Before asking Question 1, stop and think. Do not ask yet.

Identify every design decision the skill requires. For each decision, estimate:
- The prior probability that the answer is YES (your best guess before any evidence)
- How much your uncertainty about *other* decisions changes depending on the answer
- Which answer — YES or NO — cascades into more downstream decisions

This is the chess-game step. You are not just asking "what do I want to know?" You are asking "which question, answered first, gives me the most information about every other question?" A good first question is one where both YES and NO resolve multiple downstream uncertainties simultaneously. A bad first question is one that only answers itself.

Rank your candidate questions by expected information gain. The top-ranked question becomes Question 1.

Write out your reasoning explicitly before asking. Include:
- The full list of open decisions
- Your candidate questions and why you ranked them as you did
- What you will infer from YES vs. NO for each candidate
- Which question you selected and why

This reasoning is internal — show it in your thinking, not in your message to the user.

---

## Phase 2: Ask Question 1

Send the user exactly one sentence. It must be answerable with yes or no. No preamble, no explanation, no context-setting. Just the question.

---

## Phase 3: Update and Select Question 2

When the user answers, perform a Bayesian update across your open decision space:
- Which decisions does this answer resolve or strongly constrain?
- How does it shift your priors on remaining decisions?
- Which remaining question now has the highest expected information gain given what you know?

Select Question 2 using the same logic as Phase 1, but conditioned on the first answer. The second question should be meaningfully different depending on whether the first answer was YES or NO — if your Question 2 would have been the same regardless, you chose a weak Question 1.

Ask Question 2. One sentence, yes or no.

---

## Phase 4: Update and Select Question 3

Repeat the update. By now you should have eliminated most of the major branches. Question 3 resolves the last significant fork. Choose it so that both YES and NO leave you with a fully specified design — no important decision should remain ambiguous after the third answer.

Ask Question 3. One sentence, yes or no.

---

## Phase 5: Derive and Build

After the third answer, do not ask any more questions. Derive every remaining design decision from the three answers and your prior reasoning. State your derivations explicitly — show what each answer resolved and what you inferred — then build the skill.

If a minor decision genuinely could not be resolved by the three answers, make the more conservative or reversible choice and note it briefly.

---

## Skill Output Format

The skill you produce must be a Markdown file with this frontmatter:

```markdown
---
name: <skill-name>
description: <one sentence — what the skill does and when to invoke it>
---
```

The body should be a tight agent prompt: what the agent does, in what order, with what constraints. No fluffy intros. No lists of principles. Instructions the agent can follow mechanically.

---

## Constraints on Your Questions

- Every question is one sentence.
- Every question is answerable with yes or no.
- No compound questions ("Is X true and does Y apply?").
- No leading questions that reveal your preference.
- Questions must be about design decisions, not about preferences for their own sake — each question should resolve something that changes what you build.
- The three questions must be ordered so that earlier answers change which later questions you ask. If the sequence is the same regardless of answers, you have not planned deeply enough.

---

## Example of Good vs. Bad Question Selection

**Scenario:** You are designing a skill that generates reports. You have these open decisions:
1. Does the report go to a file or stdout?
2. Is the format Markdown or JSON?
3. Does it run once or on a schedule?
4. Does it include a summary section?
5. Does it pull from git history?

**Bad Question 1:** "Should the report include a summary section?" — This resolves only decision 4. YES and NO leave decisions 1, 2, 3, 5 equally open.

**Good Question 1:** "Is this skill intended to run autonomously on a schedule rather than on demand?" — YES resolves: output goes to a file (not stdout), schedule mechanism needed, format likely structured (JSON). NO resolves: stdout is fine, on-demand invocation, Markdown is fine. One question eliminates three downstream branches.

**Good Question 2 (if Q1 = YES):** "Does the output need to be consumed by another automated process rather than read by a human?" — YES → JSON, no summary. NO → Markdown, include summary. This resolves decisions 2 and 4 together.

**Good Question 2 (if Q1 = NO):** "Should the report include git history as context?" — Resolves decision 5, which now matters more in the on-demand case.

Notice that Question 2 is different depending on the first answer. That is the signal that Question 1 was well chosen.
