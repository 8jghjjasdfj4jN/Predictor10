# Predictor10 Preview Review Notes

The current live preview confirms that the **Broadcast Noir Athletics** direction is coming through clearly. The dark green-black base, fixed top header, and bottom mobile navigation already create a premium football-app feel.

Key strengths observed:

- The hero section feels strong and premium, with the generated background supporting the broadcast identity.
- The persistent master header is working and stays visually separate from page content.
- The bottom navigation is visible and mobile-appropriate.
- The predictions screen communicates round context, league selection, fixture states, and score-entry intent clearly.

Key refinement opportunities observed:

- The hero logo lockup reads visually as `Predict r1` with football glyphs, which needs refinement if the brand should read more cleanly as **Predictor10** in-app.
- The league switcher area is partially obscured by the bottom navigation on smaller viewport height, so page pacing and bottom spacing may need tuning.
- Additional pages still need final visual review in-browser after implementation.

Next implementation focus:

1. Refine the in-app logo treatment for clearer Predictor10 readability.
2. Finish remaining screen implementation and cross-page navigation review.
3. Run a final browser pass across all routes before delivery.

## Leaderboard route review

The leaderboard route renders correctly and the persistent master header remains intact. The table hierarchy is clear and the top-three side cards add competitive emphasis without feeling noisy.

Additional note:

- The leaderboard layout reads well, but the secondary route surfaces would benefit from stronger differentiated section backgrounds and possibly slightly more vertical breathing room below the sticky bottom navigation on smaller screens.

## Home route review after logo refinement

The header branding is now clearer because the compact mark explicitly spells out **Predictor10**. The hero section still carries the football-ball substitution styling, but the supporting textual lockup now improves readability substantially.

Remaining refinement note:

- The hero logo is now clearer, but if a future pass is needed for production polish, the hero lockup could be redrawn as a cleaner vector-based asset rather than relying solely on glyph composition.
