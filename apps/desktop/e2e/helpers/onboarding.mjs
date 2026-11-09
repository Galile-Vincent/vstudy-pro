/** Locators for the first-run dialog by role and accessible name, so styling classes can change freely. */

/** The forward action of the footer. Its label changes per step ("Continue", "Open Library"...) and per language, so take the last footer button (Back always precedes it). */
export const onboardingForward = page => page.locator('.onboarding footer').getByRole('button').last();

/** One of the two analytics choices on the privacy step; labels come from the analytics catalog (English by default). */
export const onboardingConsent = (page, share = true, labels = { share: 'Share usage data', decline: 'No thanks' }) =>
  page.locator('.onboarding').getByRole('button', { name: share ? labels.share : labels.decline, exact: true });
