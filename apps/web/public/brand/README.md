# Sign-in provider marks

Place the official logo files here to show them on the sign-in buttons:

- `google.svg`: the "G" mark from Google's Sign-In branding guidelines
  (https://developers.google.com/identity/branding-guidelines)
- `github.svg`: the GitHub mark from https://github.com/logos
- `microsoft.svg`: the Microsoft logo from the Microsoft identity platform branding guidelines
  (https://learn.microsoft.com/entra/identity-platform/howto-add-branding-in-apps)

Use the files exactly as provided by each brand and follow their usage rules.
Then add the id to `SIGN_IN_MARKS` in `apps/web/src/landing.jsx`. Until then the button shows a
neutral sign-in icon and the browser does not request the file.
