# Reference syntheses

Target output for the synthesis pass, written by Claude from **only** the synthesis input (group ids, counts, labels, summaries) of runs 4–5, i.e. the same information Nano gets. Use these to judge Nano and cloud models. Replace them if the input format changes.

## ubuntu.txt (run-multi-ubuntu-2026-10-23T15-25-49)

**Thesis:** iOS and Android have converged on a de facto standard for phone navigation (a gesture to go home, and home as an app). Ubuntu Touch's gesture-heavy, power-user design makes adoption needlessly hard. It should keep its distinctive side gesture, but make that gesture visible and make home a stable, app-like destination.

**Claims**
1. iOS and Android are effectively one standard: two primary gestures that are nearly identical. Deviating from them costs every new user something. (g9, g3, g29)
2. Ubuntu Touch asks too much: several gestures, some hidden or secondary, which confuse new users. (g3, g2, g43, g46, g10)
3. Keep the side gesture, but show it: an always-visible bar for novices that experts can turn off. (g4, g22, g6)
4. Home should be an app: a stable starting point that also doubles as "quit". (g24, g25, g41, g5, g7)
5. The root cause is the audience: Ubuntu Touch was built for the efficiency Linux programmers want, and growth needs a broader audience. (g10, g19, g51)

**Tensions**
- Keeping the side gesture vs "deviating from the standard is a hurdle": your own argument cuts against the gesture you want to keep.
- Efficiency (g19) vs a comfortable, stable home (g41, g24): the current philosophy and your recommendation pull in opposite directions; say which wins.
- Does going home stop apps (g25) or leave them in the background? "Quit" needs a precise meaning.

**Questions**
- Two parts or three (g1)? A natural two-part split is "the shared standard" and then "what Ubuntu Touch should change".
- Does the audience argument open the talk (as the why) or close it (as the ask)?
- What is the one minimal change you would recommend if they only did one thing?

## talk.txt (run-multi-talk-2026-10-23T15-30-14)

**Thesis:** Moving content is the desktop's core act, yet it still goes through the hidden clipboard. The three demos explore direct, spatial alternatives: parking windows at the screen edges, a parking lot for items, and grabbing or pulling content between apps. The open design problem is resolving *what* is being grabbed without breaking the plain click.

**Claims**
1. Windows can be parked spatially: drag one towards an edge and it shrinks into a widget, then an icon. (g6, g3, g4, g5, g8, g21, g18)
2. Items need a visible holding area, the parking lot, so that retrieving something replaces hunting for it. (g72, g12, g1)
3. Moving content between apps should be direct (grab or pull) rather than cut and paste. (g41, g35, g36, g11, g37, g22)
4. The hard problem is ambiguity: window vs content, highlighted vs not, and at what granularity. (g42, g52, g7, g15, g24, g25, g46, g26)
5. Constraint: a click stays a click. New power comes from modifier keys layered on top (Command-click, a dedicated key). (g45, g33, g34, g66, g67, g31)

**Tensions**
- Copy-paste is "solved" (g58), yet the demos aim to replace it. The talk needs to say what is actually broken.
- Pull might be unnecessary (g41), yet push and pull clicks both fail today (g42). Which survives?
- Two-handed modifier interactions are powerful but have a cost (g15).

**Questions**
- Which of the three demos carries the talk, and which are supporting?
- What is the one-sentence problem statement the demos answer?
- Is the grab button from your first talk the thread that ties these together (g22)?

Note: g60 "Ubuntu Touch uses both hands" is the prompt-example leak; it was ignored.
